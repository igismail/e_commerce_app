import 'dart:convert';

import 'package:e_commerce_app/api/api_client.dart';
import 'package:e_commerce_app/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  testWidgets('account sign-in connects to the API and shows the customer', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final apiClient = ApiClient(
      baseUrl: 'http://localhost:3001/api/v1',
      sessionStore: MemorySessionStore(),
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/auth/login')) {
          return http.Response(
            jsonEncode({
              'accessToken': 'access-token',
              'csrfToken': 'csrf-token',
            }),
            200,
            headers: {'set-cookie': 'refresh_token=refresh-token; HttpOnly'},
          );
        }
        return http.Response(
          jsonEncode({
            'id': 'user-1',
            'email': 'shopper@example.com',
            'firstName': 'Shopper',
            'lastName': 'One',
            'role': 'CUSTOMER',
          }),
          200,
        );
      }),
    );

    await tester.pumpWidget(CommerceApp(apiClient: apiClient));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Account'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('SIGN IN OR JOIN US'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byType(TextFormField).at(0),
      'shopper@example.com',
    );
    await tester.enterText(
      find.byType(TextFormField).at(1),
      'ExamplePassword123!',
    );
    await tester.tap(find.text('SIGN IN'));
    await tester.pumpAndSettle();

    expect(find.text('Welcome, Shopper.'), findsOneWidget);
    expect(find.text('shopper@example.com'), findsOneWidget);
    expect(
      find.text('Account sign-in will be enabled after API integration.'),
      findsNothing,
    );
  });
}

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
