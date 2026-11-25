import 'dart:convert';

import 'package:e_commerce_app/api/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  const apiUrl = 'http://localhost:3001/api/v1';

  test(
    'login stores the session and requests the authenticated profile',
    () async {
      final session = MemorySessionStore();
      final client = ApiClient(
        baseUrl: apiUrl,
        sessionStore: session,
        httpClient: MockClient((request) async {
          expect(request.url.path, startsWith('/api/v1/auth/'));
          if (request.url.path.endsWith('/auth/login')) {
            expect(jsonDecode(request.body), {
              'email': 'shopper@example.com',
              'password': 'ExamplePassword123!',
            });
            return http.Response(
              jsonEncode({
                'accessToken': 'access-token',
                'csrfToken': 'csrf-token',
              }),
              200,
              headers: {
                'set-cookie':
                    'refresh_token=refresh-token; Path=/api/v1/auth; HttpOnly, csrf_token=csrf-token; Path=/api/v1/auth',
              },
            );
          }

          expect(request.headers['authorization'], 'Bearer access-token');
          return http.Response(jsonEncode(profile), 200);
        }),
      );

      final user = await client.login(
        email: 'shopper@example.com',
        password: 'ExamplePassword123!',
      );

      expect(user.email, 'shopper@example.com');
      expect(session.values[ApiClient.accessTokenKey], 'access-token');
      expect(session.values[ApiClient.refreshCookieKey], 'refresh-token');
      expect(session.values[ApiClient.csrfTokenKey], 'csrf-token');
    },
  );

  test('expired access token is refreshed before loading the profile', () async {
    final session = MemorySessionStore()
      ..values[ApiClient.accessTokenKey] = 'expired-token'
      ..values[ApiClient.refreshCookieKey] = 'refresh-token'
      ..values[ApiClient.csrfTokenKey] = 'csrf-token';
    final client = ApiClient(
      baseUrl: apiUrl,
      sessionStore: session,
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/auth/me') &&
            request.headers['authorization'] == 'Bearer expired-token') {
          return http.Response('{"message":"Unauthorized"}', 401);
        }
        if (request.url.path.endsWith('/auth/refresh')) {
          expect(
            request.headers['cookie'],
            'refresh_token=refresh-token; csrf_token=csrf-token',
          );
          expect(request.headers['x-csrf-token'], 'csrf-token');
          return http.Response(
            jsonEncode({
              'accessToken': 'new-access-token',
              'csrfToken': 'new-csrf-token',
            }),
            200,
            headers: {
              'set-cookie':
                  'refresh_token=new-refresh-token; Path=/api/v1/auth; HttpOnly',
            },
          );
        }
        expect(request.headers['authorization'], 'Bearer new-access-token');
        return http.Response(jsonEncode(profile), 200);
      }),
    );

    final user = await client.restoreSession();

    expect(user?.id, 'user-1');
    expect(session.values[ApiClient.accessTokenKey], 'new-access-token');
    expect(session.values[ApiClient.refreshCookieKey], 'new-refresh-token');
    expect(session.values[ApiClient.csrfTokenKey], 'new-csrf-token');
  });

  test('registration surfaces API validation errors', () async {
    final client = ApiClient(
      baseUrl: apiUrl,
      sessionStore: MemorySessionStore(),
      httpClient: MockClient(
        (_) async => http.Response(
          '{"message":["password is too short","password is weak"]}',
          400,
        ),
      ),
    );

    await expectLater(
      client.register(
        email: 'new@example.com',
        password: 'short',
        firstName: 'New',
        lastName: 'Shopper',
      ),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          'password is too short password is weak',
        ),
      ),
    );
  });

  test(
    'registration sends the API account fields and returns its message',
    () async {
      final client = ApiClient(
        baseUrl: apiUrl,
        sessionStore: MemorySessionStore(),
        httpClient: MockClient((request) async {
          expect(request.url.path, '/api/v1/auth/register');
          expect(jsonDecode(request.body), {
            'email': 'new@example.com',
            'password': 'ExamplePassword123!',
            'firstName': 'New',
            'lastName': 'Shopper',
          });
          return http.Response(
            '{"message":"Check your email to verify your account."}',
            201,
          );
        }),
      );

      final message = await client.register(
        email: ' new@example.com ',
        password: 'ExamplePassword123!',
        firstName: ' New ',
        lastName: ' Shopper ',
      );

      expect(message, 'Check your email to verify your account.');
    },
  );
}

const profile = {
  'id': 'user-1',
  'email': 'shopper@example.com',
  'firstName': 'Shopper',
  'lastName': 'One',
  'role': 'CUSTOMER',
};

class MemorySessionStore implements SessionStore {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}
