import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'api_transport.dart';

abstract interface class SessionStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureSessionStore implements SessionStore {
  SecureSessionStore([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.role,
  });

  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final String role;

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
    id: json['id'] as String,
    email: json['email'] as String,
    firstName: json['firstName'] as String,
    lastName: json['lastName'] as String,
    role: json['role'] as String,
  );
}

class ApiClient {
  ApiClient({
    http.Client? httpClient,
    SessionStore? sessionStore,
    String? baseUrl,
  }) : _httpClient = httpClient ?? createApiHttpClient(),
       _sessionStore = sessionStore ?? SecureSessionStore(),
       baseUrl = baseUrl ?? _defaultBaseUrl {
    final parsed = Uri.tryParse(this.baseUrl);
    if (parsed == null ||
        !parsed.hasAuthority ||
        (parsed.scheme != 'http' && parsed.scheme != 'https')) {
      throw ArgumentError.value(this.baseUrl, 'baseUrl', 'Must be an HTTP URL');
    }
    _baseUri = parsed.replace(
      path: '${parsed.path.replaceFirst(RegExp(r'/+$'), '')}/',
    );
  }

  static const accessTokenKey = 'commerce.access_token';
  static const refreshCookieKey = 'commerce.refresh_cookie';
  static const csrfTokenKey = 'commerce.csrf_token';

  final http.Client _httpClient;
  final SessionStore _sessionStore;
  final String baseUrl;
  late final Uri _baseUri;

  static String get _defaultBaseUrl {
    const configured = String.fromEnvironment('API_BASE_URL');
    if (configured.isNotEmpty) return configured;
    return defaultTargetPlatform == TargetPlatform.android && !kIsWeb
        ? 'http://10.0.2.2:3001/api/v1'
        : 'http://localhost:3001/api/v1';
  }

  Future<String> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
  }) async {
    final response = await _request(
      'POST',
      'auth/register',
      authenticated: false,
      body: {
        'email': email.trim(),
        'password': password,
        'firstName': firstName.trim(),
        'lastName': lastName.trim(),
      },
    );
    final payload = _ensureSuccess(response);
    return payload['message'] is String
        ? payload['message'] as String
        : 'Your account was created. Check your email to verify it.';
  }

  Future<AuthUser> login({
    required String email,
    required String password,
  }) async {
    final response = await _request(
      'POST',
      'auth/login',
      authenticated: false,
      body: {'email': email.trim(), 'password': password},
    );
    final payload = _ensureSuccess(response);
    final accessToken = payload['accessToken'];
    final csrfToken = payload['csrfToken'];
    if (accessToken is! String || csrfToken is! String) {
      throw const ApiException('The API returned an invalid sign-in response.');
    }
    await _sessionStore.write(accessTokenKey, accessToken);
    await _sessionStore.write(csrfTokenKey, csrfToken);
    return _loadCurrentUser();
  }

  Future<AuthUser?> restoreSession() async {
    final accessToken = await _sessionStore.read(accessTokenKey);
    if (accessToken == null) {
      await _clearSession();
      return null;
    }

    try {
      return await _loadCurrentUser();
    } on ApiException catch (error) {
      if (error.statusCode != 401) rethrow;
    }

    try {
      await _refreshSession();
      return await _loadCurrentUser();
    } on ApiException catch (error) {
      if (error.statusCode != 401) rethrow;
      await _clearSession();
      return null;
    }
  }

  Future<void> logout() async {
    try {
      final response = await _request(
        'POST',
        'auth/logout',
        authenticated: false,
        sendSessionCookies: true,
        csrfProtected: true,
        retryAuthentication: false,
      );
      _ensureSuccess(response);
    } finally {
      await _clearSession();
    }
  }

  Future<AuthUser> _loadCurrentUser() async {
    final response = await _request('GET', 'auth/me');
    return AuthUser.fromJson(_ensureSuccess(response));
  }

  Future<void> _refreshSession() async {
    final response = await _request(
      'POST',
      'auth/refresh',
      authenticated: false,
      sendSessionCookies: true,
      csrfProtected: true,
      retryAuthentication: false,
    );
    final payload = _ensureSuccess(response);
    final accessToken = payload['accessToken'];
    final csrfToken = payload['csrfToken'];
    if (accessToken is! String || csrfToken is! String) {
      throw const ApiException('The API returned an invalid refresh response.');
    }
    await _sessionStore.write(accessTokenKey, accessToken);
    await _sessionStore.write(csrfTokenKey, csrfToken);
  }

  Future<http.Response> _request(
    String method,
    String path, {
    Map<String, Object?>? body,
    bool authenticated = true,
    bool sendSessionCookies = false,
    bool csrfProtected = false,
    bool retryAuthentication = true,
  }) async {
    final request = http.Request(method, _baseUri.resolve(path));
    request.headers['Accept'] = 'application/json';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    if (authenticated) {
      final accessToken = await _sessionStore.read(accessTokenKey);
      if (accessToken != null) {
        request.headers['Authorization'] = 'Bearer $accessToken';
      }
    }
    if (sendSessionCookies && supportsManualCookies) {
      final cookie = await _sessionCookieHeader();
      if (cookie.isNotEmpty) request.headers['Cookie'] = cookie;
    }
    if (csrfProtected) {
      final csrfToken = await _sessionStore.read(csrfTokenKey);
      if (csrfToken != null) request.headers['x-csrf-token'] = csrfToken;
    }

    late final http.Response response;
    try {
      final streamed = await _httpClient.send(request).timeout(
        const Duration(seconds: 20),
      );
      response = await http.Response.fromStream(streamed).timeout(
        const Duration(seconds: 20),
      );
    } on http.ClientException {
      throw ApiException('Could not connect to the API at $baseUrl.');
    } on TimeoutException {
      throw ApiException('The API request timed out at $baseUrl.');
    }

    await _storeRefreshCookie(response);
    if (response.statusCode == 401 &&
        authenticated &&
        retryAuthentication &&
        path != 'auth/refresh' &&
        path != 'auth/logout') {
      try {
        await _refreshSession();
      } on ApiException catch (error) {
        if (error.statusCode == 401) await _clearSession();
        rethrow;
      }
      return _request(
        method,
        path,
        body: body,
        authenticated: authenticated,
        sendSessionCookies: sendSessionCookies,
        csrfProtected: csrfProtected,
        retryAuthentication: false,
      );
    }
    return response;
  }

  Future<String> _sessionCookieHeader() async {
    final refreshCookie = await _sessionStore.read(refreshCookieKey);
    final csrfToken = await _sessionStore.read(csrfTokenKey);
    return [
      if (refreshCookie != null && refreshCookie.isNotEmpty)
        'refresh_token=$refreshCookie',
      if (csrfToken != null && csrfToken.isNotEmpty) 'csrf_token=$csrfToken',
    ].join('; ');
  }

  Future<void> _storeRefreshCookie(http.Response response) async {
    if (!supportsManualCookies) return;
    final setCookie = response.headers['set-cookie'];
    if (setCookie == null) return;

    for (final match in RegExp(
      r'(?:^|,\s*)(refresh_token|csrf_token)=([^;,\s]+)',
    ).allMatches(setCookie)) {
      final name = match.group(1);
      final value = match.group(2);
      if (name == 'refresh_token' && value != null) {
        await _sessionStore.write(refreshCookieKey, value);
      } else if (name == 'csrf_token' && value != null) {
        await _sessionStore.write(csrfTokenKey, value);
      }
    }
  }

  Map<String, dynamic> _ensureSuccess(http.Response response) {
    Object? payload;
    if (response.body.isNotEmpty) {
      try {
        payload = jsonDecode(response.body);
      } on FormatException {
        throw ApiException(
          'The API returned an unreadable response (${response.statusCode}).',
          statusCode: response.statusCode,
        );
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = payload is Map<String, dynamic>
          ? payload['message']
          : null;
      final text = message is List
          ? message.join(' ')
          : message is String
          ? message
          : 'Request failed (${response.statusCode}).';
      throw ApiException(text, statusCode: response.statusCode);
    }

    if (payload == null) return <String, dynamic>{};
    if (payload is Map<String, dynamic>) return payload;
    throw const ApiException('The API returned an unexpected response.');
  }

  Future<void> _clearSession() async {
    await Future.wait([
      _sessionStore.delete(accessTokenKey),
      _sessionStore.delete(refreshCookieKey),
      _sessionStore.delete(csrfTokenKey),
    ]);
  }
}
