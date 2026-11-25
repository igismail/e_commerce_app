import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:e_commerce_app/main.dart';

void main() {
  testWidgets('storefront renders its catalog and primary navigation', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const CommerceApp());
    await tester.pump();

    expect(find.text('FIELD & FORM'), findsOneWidget);
    expect(find.text('Good things.\nMade to stay.'), findsOneWidget);
    expect(find.text('Find your kind of good'), findsOneWidget);
    expect(find.text('Everyday Ceramic Mug'), findsWidgets);
    expect(find.text('Discover'), findsOneWidget);
    expect(find.text('Your corner.'), findsNothing);
  });

  testWidgets(
    'shopping bag shows a useful empty state and returns to the shop',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(const CommerceApp());
      await tester.pump();

      await tester.tap(find.text('Bag'));
      await tester.pumpAndSettle();
      expect(find.text('Your bag is taking a breather'), findsOneWidget);

      await tester.tap(find.text('FIND YOUR NEXT FAVORITE'));
      await tester.pumpAndSettle();
      expect(find.text('Good things.\nMade to stay.'), findsOneWidget);
    },
  );

  testWidgets('category chips filter the sample collection', (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const CommerceApp());
    await tester.pump();
    await tester.tap(find.text('Outdoors').first);
    await tester.pumpAndSettle();

    expect(find.text('Everywhere Water Bottle'), findsOneWidget);
    expect(find.text('Everyday Ceramic Mug'), findsNothing);
  });

  testWidgets('item detail can add a product to the bag', (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const CommerceApp());
    await tester.pump();
    await tester.tap(find.text('Everyday Ceramic Mug').first);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Moss'));
    await tester.pumpAndSettle();
    expect(find.text('ADD TO BAG  ·  \$28'), findsOneWidget);
    await tester.tap(find.text('ADD TO BAG  ·  \$28'));
    await tester.pumpAndSettle();
    expect(find.text('Everyday Ceramic Mug added to your bag'), findsOneWidget);

    await tester.tap(find.text('Bag'));
    await tester.pumpAndSettle();
    expect(find.text('Your bag'), findsOneWidget);
    expect(find.text('\$28'), findsWidgets);
    expect(find.text('Option: Moss'), findsOneWidget);
  });

  testWidgets('checkout validates shipping details before preview completion', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const CommerceApp());
    await tester.pump();
    await tester.tap(find.text('Everyday Ceramic Mug').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Oat'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('ADD TO BAG  ·  \$28'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bag'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('coupon-code')), 'WELCOME10');
    await tester.tap(find.text('APPLY'));
    await tester.pumpAndSettle();
    expect(find.text('WELCOME10 applied'), findsOneWidget);
    expect(find.text('-\$3'), findsOneWidget);
    await tester.tap(find.text('CONTINUE TO CHECKOUT'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('PLACE DEMO ORDER'));
    await tester.pumpAndSettle();
    expect(find.text('Please enter full name'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).at(0), 'Alex Morgan');
    await tester.enterText(
      find.byType(TextFormField).at(1),
      'alex@example.com',
    );
    await tester.enterText(
      find.byType(TextFormField).at(2),
      '10 Market Street',
    );
    await tester.enterText(find.byType(TextFormField).at(3), 'Portland');
    await tester.enterText(find.byType(TextFormField).at(4), '97205');
    await tester.ensureVisible(find.text('PLACE DEMO ORDER').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('PLACE DEMO ORDER'));
    await tester.pumpAndSettle();

    expect(find.text('That’s a wrap.'), findsOneWidget);
    expect(find.textContaining('Your demo order is all set.'), findsOneWidget);
  });
}
