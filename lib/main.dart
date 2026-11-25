import 'package:flutter/material.dart';

const ink = Color(0xFF1E3029);
const muted = Color(0xFF7C817B);
const paper = Color(0xFFF8F7F2);
const line = Color(0xFFE9E7DF);
const green = Color(0xFF345B47);
const orange = Color(0xFFC96F48);

void main() => runApp(const CommerceApp());

class CommerceApp extends StatefulWidget {
  const CommerceApp({super.key});

  @override
  State<CommerceApp> createState() => _CommerceAppState();
}

class _CommerceAppState extends State<CommerceApp> {
  final cart = <CartLine>[];
  final favorites = <String>{};
  final searchController = TextEditingController();
  final navigatorKey = GlobalKey<NavigatorState>();
  final scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();
  int tab = 0;
  String category = 'All';
  String search = '';
  String sort = 'Featured';
  bool inStockOnly = false;
  RangeValues priceRange = const RangeValues(0, 250);
  String? coupon;

  int get cartCount => cart.fold(0, (sum, line) => sum + line.quantity);
  int get subtotal =>
      cart.fold(0, (sum, line) => sum + line.product.price * line.quantity);
  int get discount => coupon == 'WELCOME10' ? (subtotal * .1).round() : 0;

  List<Product> get visibleProducts {
    final needle = search.trim().toLowerCase();
    final products = demoProducts.where((product) {
      return (category == 'All' || category == product.category) &&
          (needle.isEmpty ||
              '${product.name} ${product.brand} ${product.category}'
                  .toLowerCase()
                  .contains(needle)) &&
          product.price >= priceRange.start.round() &&
          product.price <= priceRange.end.round() &&
          (!inStockOnly || product.inStock) &&
          (tab != 2 || favorites.contains(product.id));
    }).toList();
    switch (sort) {
      case 'Price: low to high':
        products.sort((a, b) => a.price.compareTo(b.price));
      case 'Price: high to low':
        products.sort((a, b) => b.price.compareTo(a.price));
      case 'Top rated':
        products.sort((a, b) => b.rating.compareTo(a.rating));
      default:
        products.sort((a, b) => b.featured.compareTo(a.featured));
    }
    return products;
  }

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  void _search(String value) => setState(() {
    search = value;
    if (value.isNotEmpty) tab = 1;
  });

  void _add(Product product, [int quantity = 1, String option = 'Standard']) {
    setState(() {
      final matches = cart.where(
        (line) => line.product.id == product.id && line.option == option,
      );
      if (matches.isEmpty) {
        cart.add(CartLine(product, quantity, option));
      } else if (matches.first.quantity < 99) {
        matches.first.quantity = (matches.first.quantity + quantity)
            .clamp(1, 99)
            .toInt();
      }
    });
    scaffoldMessengerKey.currentState!
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('${product.name} added to your bag'),
          behavior: SnackBarBehavior.floating,
          action: SnackBarAction(
            label: 'VIEW BAG',
            onPressed: () => setState(() => tab = 3),
          ),
        ),
      );
  }

  Future<void> _filters() async {
    final value = await showModalBottomSheet<FilterValues>(
      context: navigatorKey.currentContext!,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) =>
          FilterSheet(sort: sort, inStock: inStockOnly, priceRange: priceRange),
    );
    if (value != null) {
      setState(() {
        sort = value.sort;
        inStockOnly = value.inStock;
        priceRange = value.priceRange;
      });
    }
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    navigatorKey: navigatorKey,
    scaffoldMessengerKey: scaffoldMessengerKey,
    title: 'Field & Form — Good things, well made.',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: paper,
      colorScheme: ColorScheme.fromSeed(seedColor: green, primary: green),
      appBarTheme: const AppBarTheme(
        backgroundColor: paper,
        foregroundColor: ink,
        surfaceTintColor: Colors.transparent,
      ),
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          color: ink,
          fontSize: 44,
          height: 1.08,
          fontWeight: FontWeight.w500,
          letterSpacing: -1.6,
        ),
        headlineMedium: TextStyle(
          color: ink,
          fontSize: 32,
          height: 1.12,
          fontWeight: FontWeight.w500,
          letterSpacing: -1.1,
        ),
        titleLarge: TextStyle(
          color: ink,
          fontSize: 22,
          fontWeight: FontWeight.w600,
        ),
        titleMedium: TextStyle(
          color: ink,
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
        bodyLarge: TextStyle(color: ink, fontSize: 15, height: 1.5),
        bodyMedium: TextStyle(color: muted, fontSize: 13, height: 1.45),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        hintStyle: const TextStyle(color: muted, fontSize: 14),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 15,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: green, width: 1.5),
        ),
      ),
    ),
    home: Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            StoreHeader(
              count: cartCount,
              controller: searchController,
              onSearch: _search,
              onHome: () => setState(() => tab = 0),
              onAccount: () => setState(() => tab = 4),
              onCart: () => setState(() => tab = 3),
            ),
            Expanded(child: _page()),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (index) => setState(() {
          tab = index;
          if (index == 1) category = 'All';
        }),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: 'Home',
          ),
          const NavigationDestination(
            icon: Icon(Icons.search_rounded),
            label: 'Discover',
          ),
          const NavigationDestination(
            icon: Icon(Icons.favorite_border_rounded),
            selectedIcon: Icon(Icons.favorite_rounded),
            label: 'Saved',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: cartCount > 0,
              label: Text('$cartCount'),
              child: const Icon(Icons.shopping_bag_outlined),
            ),
            selectedIcon: const Icon(Icons.shopping_bag_rounded),
            label: 'Bag',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Account',
          ),
        ],
      ),
    ),
  );

  Widget _page() {
    switch (tab) {
      case 1:
        return _shop(title: 'Discover');
      case 2:
        return _shop(title: 'Saved pieces');
      case 3:
        return CartPage(
          cart: cart,
          subtotal: subtotal,
          discount: discount,
          coupon: coupon,
          onQuantity: (line, change) => setState(() {
            line.quantity += change;
            if (line.quantity <= 0) cart.remove(line);
          }),
          onRemove: (line) => setState(() => cart.remove(line)),
          onCoupon: (code) {
            if (code.trim().toUpperCase() != 'WELCOME10') return false;
            setState(() => coupon = 'WELCOME10');
            return true;
          },
          onRemoveCoupon: () => setState(() => coupon = null),
          onShop: () => setState(() => tab = 0),
          onCheckout: _checkout,
        );
      case 4:
        return AccountPage(onSaved: () => setState(() => tab = 2));
      default:
        return _shop(showHero: true);
    }
  }

  Widget _shop({bool showHero = false, String? title}) {
    final products = visibleProducts;
    return CustomScrollView(
      key: PageStorageKey('shop-$tab'),
      slivers: [
        if (showHero)
          SliverToBoxAdapter(
            child: HeroBanner(onExplore: () => setState(() => tab = 1)),
          ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 25, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (showHero) const EditorialNote(),
                if (title != null) ...[
                  Text(
                    title,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 7),
                  Text(
                    title == 'Saved pieces'
                        ? 'A little collection of things you love.'
                        : 'Everyday essentials, considered.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 20),
                ],
                SectionHeading(
                  title: showHero ? 'Find your kind of good' : 'Shop by mood',
                  action: showHero ? 'VIEW ALL' : null,
                  onAction: () => setState(() => tab = 1),
                ),
                const SizedBox(height: 12),
                CategoryStrip(
                  selected: category,
                  onSelected: (value) => setState(() => category = value),
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: SectionHeading(
                        title: search.isNotEmpty
                            ? 'Results for “$search”'
                            : tab == 2
                            ? 'Your shortlist'
                            : category == 'All'
                            ? showHero
                                  ? 'A few favorites'
                                  : 'The collection'
                            : category,
                        subtitle: '${products.length} considered finds',
                      ),
                    ),
                    IconButton(
                      tooltip: 'Filter and sort products',
                      onPressed: _filters,
                      icon: const Icon(Icons.tune_rounded),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ),
        if (products.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyState(
              icon: tab == 2
                  ? Icons.favorite_border_rounded
                  : Icons.search_off_rounded,
              title: tab == 2 ? 'Nothing saved just yet' : 'No matches',
              message: tab == 2
                  ? 'Tap the heart on something you like and it will be waiting here.'
                  : 'Try another search or loosen your filters a little.',
              action: tab == 2 ? 'EXPLORE THE SHOP' : 'CLEAR FILTERS',
              onAction: () => setState(() {
                favorites.clear();
                search = '';
                searchController.clear();
                category = 'All';
                inStockOnly = false;
                priceRange = const RangeValues(0, 250);
              }),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
            sliver: SliverLayoutBuilder(
              builder: (context, constraints) {
                final width = constraints.crossAxisExtent;
                final columns = width > 1000
                    ? 4
                    : width > 650
                    ? 3
                    : 2;
                return SliverGrid.builder(
                  itemCount: products.length,
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    crossAxisSpacing: 14,
                    mainAxisSpacing: 24,
                    mainAxisExtent: width > 650 ? 350 : 310,
                  ),
                  itemBuilder: (context, index) {
                    final product = products[index];
                    return ProductCard(
                      product: product,
                      favorite: favorites.contains(product.id),
                      onFavorite: () => setState(() {
                        if (!favorites.add(product.id)) {
                          favorites.remove(product.id);
                        }
                      }),
                      onTap: () => _openProduct(product),
                      onAdd: () => _add(product, 1, product.options.first),
                    );
                  },
                );
              },
            ),
          ),
        if (showHero)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(20, 10, 20, 40),
              child: PromiseCard(),
            ),
          ),
      ],
    );
  }

  void _openProduct(Product product) {
    navigatorKey.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => ProductDetailPage(
          product: product,
          favorite: favorites.contains(product.id),
          onFavorite: () => setState(() {
            if (!favorites.add(product.id)) favorites.remove(product.id);
          }),
          onAdd: (quantity, option) => _add(product, quantity, option),
        ),
      ),
    );
  }

  Future<void> _checkout() async {
    final completed = await navigatorKey.currentState!.push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => CheckoutPage(
          total: subtotal - discount,
          onPlaceOrder: () => setState(() {
            cart.clear();
            coupon = null;
          }),
        ),
      ),
    );
    if (completed == true && mounted) setState(() => tab = 0);
  }
}

class Product {
  const Product({
    required this.id,
    required this.name,
    required this.brand,
    required this.category,
    required this.price,
    required this.rating,
    required this.reviews,
    required this.image,
    required this.description,
    required this.color,
    this.originalPrice,
    this.options = const ['Standard'],
    this.badge,
    this.inStock = true,
    this.featured = 0,
  });

  final String id;
  final String name;
  final String brand;
  final String category;
  final int price;
  final double rating;
  final int reviews;
  final String image;
  final String description;
  final Color color;
  final int? originalPrice;
  final List<String> options;
  final String? badge;
  final bool inStock;
  final int featured;
}

class CartLine {
  CartLine(this.product, this.quantity, this.option);
  final Product product;
  int quantity;
  final String option;
}

const demoProducts = <Product>[
  Product(
    id: 'mug',
    name: 'Everyday Ceramic Mug',
    brand: 'COMMON GOOD',
    category: 'Home',
    price: 28,
    originalPrice: 34,
    rating: 4.9,
    reviews: 128,
    image:
        'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=85',
    description:
        'A quietly beautiful mug for slow mornings and second cups. Hand-finished stoneware, made to feel right at home.',
    color: Color(0xFFD8C9B6),
    badge: 'BESTSELLER',
    options: ['Oat', 'Moss', 'Ink'],
    featured: 10,
  ),
  Product(
    id: 'tote',
    name: 'Market Day Canvas Tote',
    brand: 'FIELD NOTES',
    category: 'Accessories',
    price: 42,
    rating: 4.8,
    reviews: 86,
    image:
        'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85',
    description:
        'Room for the market, the library, and everything in between. Heavyweight recycled cotton with an easy everyday shape.',
    color: Color(0xFFDBD5C9),
    badge: 'LOW IMPACT',
    featured: 9,
  ),
  Product(
    id: 'tee',
    name: 'Soft Cotton Crew Tee',
    brand: 'FORM STUDIO',
    category: 'Apparel',
    price: 36,
    rating: 4.7,
    reviews: 214,
    image:
        'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85',
    description:
        'The one you reach for again. Cut from breathable organic cotton with a relaxed, considered fit.',
    color: Color(0xFFD9DDD3),
    options: ['XS', 'S', 'M', 'L', 'XL'],
    featured: 8,
  ),
  Product(
    id: 'bottle',
    name: 'Everywhere Water Bottle',
    brand: 'GOOD OBJECTS',
    category: 'Outdoors',
    price: 32,
    rating: 4.9,
    reviews: 64,
    image:
        'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85',
    description:
        'An everyday refill, made easy. Double-wall stainless steel keeps your drink just how you like it.',
    color: Color(0xFFD4D9D2),
    badge: 'NEW',
    options: ['Sage', 'Clay', 'Midnight'],
    featured: 7,
  ),
  Product(
    id: 'throw',
    name: 'Sunday Woven Throw',
    brand: 'COMMON GOOD',
    category: 'Home',
    price: 88,
    rating: 4.8,
    reviews: 42,
    image:
        'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=85',
    description:
        'A soft landing at the end of the day. Woven from responsibly sourced cotton in a warm, easy-to-layer neutral.',
    color: Color(0xFFE1D5C5),
    featured: 6,
  ),
  Product(
    id: 'sneakers',
    name: 'Weekend Walkers',
    brand: 'FIELD NOTES',
    category: 'Apparel',
    price: 112,
    rating: 4.6,
    reviews: 97,
    image:
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85',
    description:
        'A lightweight everyday sneaker with a cushioned sole and recycled knit upper, ready for the long way home.',
    color: Color(0xFFE1D5C5),
    originalPrice: 128,
    options: ['US 6', 'US 7', 'US 8', 'US 9', 'US 10'],
    featured: 5,
  ),
  Product(
    id: 'planter',
    name: 'Little Clay Planter',
    brand: 'GOOD OBJECTS',
    category: 'Home',
    price: 24,
    rating: 4.8,
    reviews: 53,
    image:
        'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=900&q=85',
    description:
        'A little home for something green. Each planter has a softly textured finish and a drainage-friendly base.',
    color: Color(0xFFD5C2AD),
    featured: 4,
  ),
  Product(
    id: 'journal',
    name: 'The Daily Pages Journal',
    brand: 'FORM STUDIO',
    category: 'Accessories',
    price: 22,
    rating: 4.9,
    reviews: 161,
    image:
        'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=900&q=85',
    description:
        'A little room to think. Recycled paper, a clothbound cover, and 160 pages for plans, lists, and everything else.',
    color: Color(0xFFD8D0C2),
    badge: 'STAFF PICK',
    inStock: false,
    featured: 3,
  ),
];

class StoreHeader extends StatelessWidget {
  const StoreHeader({
    required this.count,
    required this.controller,
    required this.onSearch,
    required this.onHome,
    required this.onAccount,
    required this.onCart,
    super.key,
  });

  final int count;
  final TextEditingController controller;
  final ValueChanged<String> onSearch;
  final VoidCallback onHome;
  final VoidCallback onAccount;
  final VoidCallback onCart;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width > 650;
    Widget searchBox() => SizedBox(
      width: wide ? 250 : null,
      height: 44,
      child: TextField(
        controller: controller,
        onChanged: onSearch,
        decoration: const InputDecoration(
          hintText: 'Search good things...',
          prefixIcon: Icon(Icons.search_rounded, size: 20),
          contentPadding: EdgeInsets.symmetric(vertical: 8),
        ),
      ),
    );
    return Column(
      children: [
        Container(
          width: double.infinity,
          color: ink,
          padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 16),
          child: const Text(
            'A little less, a little better.  Free shipping on orders \$75+',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white,
              fontSize: 11,
              letterSpacing: .35,
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 12, 14, 12),
          child: Row(
            children: [
              InkWell(onTap: onHome, child: const Wordmark()),
              const Spacer(),
              if (wide) ...[
                searchBox(),
                const SizedBox(width: 8),
                IconButton(
                  tooltip: 'Your account',
                  onPressed: onAccount,
                  icon: const Icon(Icons.person_outline_rounded),
                ),
              ],
              IconButton(
                tooltip: 'Shopping bag',
                onPressed: onCart,
                icon: Badge(
                  isLabelVisible: count > 0,
                  label: Text('$count'),
                  child: const Icon(Icons.shopping_bag_outlined),
                ),
              ),
            ],
          ),
        ),
        if (!wide)
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 12),
            child: searchBox(),
          ),
        const Divider(height: 1, color: line),
      ],
    );
  }
}

class Wordmark extends StatelessWidget {
  const Wordmark({super.key});

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
          color: green,
          borderRadius: BorderRadius.circular(9),
        ),
        child: const Icon(Icons.spa_outlined, color: Colors.white, size: 19),
      ),
      const SizedBox(width: 9),
      const Text(
        'FIELD & FORM',
        style: TextStyle(
          color: ink,
          fontSize: 14,
          fontWeight: FontWeight.w800,
          letterSpacing: 1.35,
        ),
      ),
    ],
  );
}

class HeroBanner extends StatelessWidget {
  const HeroBanner({required this.onExplore, super.key});
  final VoidCallback onExplore;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width > 700;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: SizedBox(
          height: wide ? 450 : 500,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.network(
                'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1800&q=90',
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const ColoredBox(
                  color: Color(0xFFE2DED3),
                  child: Icon(Icons.weekend_outlined, color: green, size: 80),
                ),
              ),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [
                      ink.withValues(alpha: .82),
                      ink.withValues(alpha: .48),
                      ink.withValues(alpha: .03),
                    ],
                    stops: const [0, .52, 1],
                  ),
                ),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: wide ? 54 : 26,
                      vertical: 28,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 11,
                            vertical: 7,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: .15),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: .35),
                            ),
                          ),
                          child: const Text(
                            'THOUGHTFULLY MADE · EASY TO LOVE',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              letterSpacing: 1.1,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          'Good things.\nMade to stay.',
                          style: Theme.of(context).textTheme.headlineLarge
                              ?.copyWith(color: Colors.white, fontSize: 42),
                        ),
                        const SizedBox(height: 14),
                        const Text(
                          'Useful, lovely things for the everyday. Made with care, chosen to last.',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            height: 1.55,
                          ),
                        ),
                        const SizedBox(height: 22),
                        FilledButton(
                          onPressed: onExplore,
                          style: FilledButton.styleFrom(
                            backgroundColor: Colors.white,
                            foregroundColor: ink,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 20,
                              vertical: 14,
                            ),
                          ),
                          child: const Text('EXPLORE THE COLLECTION'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class EditorialNote extends StatelessWidget {
  const EditorialNote({super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(2, 0, 2, 28),
    child: Row(
      children: [
        const Icon(Icons.eco_outlined, size: 18, color: green),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            'Fewer, better things. Good for your home and a little kinder to the planet.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
      ],
    ),
  );
}

class SectionHeading extends StatelessWidget {
  const SectionHeading({
    required this.title,
    this.subtitle,
    this.action,
    this.onAction,
    super.key,
  });
  final String title;
  final String? subtitle;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.end,
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ],
        ),
      ),
      if (action != null)
        TextButton(
          onPressed: onAction,
          child: Text(
            action!,
            style: const TextStyle(
              color: green,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: .6,
            ),
          ),
        ),
    ],
  );
}

class CategoryStrip extends StatelessWidget {
  const CategoryStrip({
    required this.selected,
    required this.onSelected,
    super.key,
  });
  final String selected;
  final ValueChanged<String> onSelected;
  static const items = [
    ('All', Icons.grid_view_rounded),
    ('Home', Icons.chair_alt_outlined),
    ('Apparel', Icons.checkroom_outlined),
    ('Outdoors', Icons.park_outlined),
    ('Accessories', Icons.sell_outlined),
  ];

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 40,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: items.length,
      separatorBuilder: (_, _) => const SizedBox(width: 8),
      itemBuilder: (context, index) {
        final (name, icon) = items[index];
        final active = selected == name;
        return ChoiceChip(
          avatar: Icon(icon, size: 16, color: active ? Colors.white : green),
          label: Text(name),
          selected: active,
          showCheckmark: false,
          onSelected: (_) => onSelected(name),
          backgroundColor: Colors.white,
          selectedColor: green,
          labelStyle: TextStyle(
            color: active ? Colors.white : ink,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
          side: BorderSide(color: active ? green : line),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
        );
      },
    ),
  );
}

class ProductCard extends StatelessWidget {
  const ProductCard({
    required this.product,
    required this.favorite,
    required this.onFavorite,
    required this.onTap,
    required this.onAdd,
    super.key,
  });
  final Product product;
  final bool favorite;
  final VoidCallback onFavorite;
  final VoidCallback onTap;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: '${product.name}, \$${product.price}',
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: ProductImage(product: product, rounded: false),
                ),
                if (product.badge != null)
                  Positioned(
                    top: 10,
                    left: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: .94),
                        borderRadius: BorderRadius.circular(7),
                      ),
                      child: Text(
                        product.badge!,
                        style: const TextStyle(
                          color: ink,
                          fontSize: 8,
                          letterSpacing: .55,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                Positioned(
                  top: 7,
                  right: 7,
                  child: Material(
                    color: Colors.white.withValues(alpha: .92),
                    shape: const CircleBorder(),
                    child: IconButton(
                      visualDensity: VisualDensity.compact,
                      tooltip: favorite ? 'Remove from saved' : 'Save item',
                      onPressed: onFavorite,
                      icon: Icon(
                        favorite
                            ? Icons.favorite_rounded
                            : Icons.favorite_border_rounded,
                        size: 19,
                        color: favorite ? orange : ink,
                      ),
                    ),
                  ),
                ),
                if (!product.inStock)
                  Positioned(
                    left: 10,
                    bottom: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: ink.withValues(alpha: .9),
                        borderRadius: BorderRadius.circular(7),
                      ),
                      child: const Text(
                        'SOLD OUT',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 11),
          Text(
            product.brand,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: muted,
              fontSize: 9,
              letterSpacing: 1,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            product.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: ink,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 260;
              return Row(
                children: [
                  const Icon(Icons.star_rounded, size: 14, color: orange),
                  const SizedBox(width: 3),
                  Text(
                    compact
                        ? '${product.rating}'
                        : '${product.rating}  (${product.reviews})',
                    style: const TextStyle(color: muted, fontSize: 10),
                  ),
                  const Spacer(),
                  if (product.originalPrice != null && !compact)
                    Padding(
                      padding: const EdgeInsets.only(right: 5),
                      child: Text(
                        '\$${product.originalPrice}',
                        style: const TextStyle(
                          color: muted,
                          fontSize: 10,
                          decoration: TextDecoration.lineThrough,
                        ),
                      ),
                    ),
                  Text(
                    '\$${product.price}',
                    style: const TextStyle(
                      color: ink,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  IconButton(
                    tooltip: product.inStock
                        ? 'Add item'
                        : 'Currently sold out',
                    constraints: const BoxConstraints.tightFor(
                      width: 36,
                      height: 36,
                    ),
                    padding: EdgeInsets.zero,
                    visualDensity: VisualDensity.compact,
                    onPressed: product.inStock ? onAdd : null,
                    icon: const Icon(Icons.add_shopping_cart_rounded, size: 17),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    ),
  );
}

class ProductImage extends StatelessWidget {
  const ProductImage({required this.product, this.rounded = true, super.key});
  final Product product;
  final bool rounded;

  @override
  Widget build(BuildContext context) {
    Widget image = Image.network(
      product.image,
      fit: BoxFit.cover,
      errorBuilder: (_, _, _) => ColoredBox(
        color: product.color,
        child: Center(
          child: Icon(
            categoryIcon(product.category),
            size: 50,
            color: green.withValues(alpha: .75),
          ),
        ),
      ),
    );
    if (rounded) {
      image = ClipRRect(borderRadius: BorderRadius.circular(18), child: image);
    }
    return ColoredBox(color: product.color, child: image);
  }
}

IconData categoryIcon(String category) => switch (category) {
  'Home' => Icons.chair_alt_outlined,
  'Apparel' => Icons.checkroom_outlined,
  'Outdoors' => Icons.park_outlined,
  _ => Icons.auto_awesome_outlined,
};

class PromiseCard extends StatelessWidget {
  const PromiseCard({super.key});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: const Color(0xFFEEECE3),
      borderRadius: BorderRadius.circular(18),
    ),
    child: const Row(
      children: [
        SizedBox(
          width: 44,
          height: 44,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.all(Radius.circular(13)),
            ),
            child: Icon(Icons.eco_outlined, color: green),
          ),
        ),
        SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Made with a little more thought.',
                style: TextStyle(
                  color: ink,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
              SizedBox(height: 4),
              Text(
                'Better materials, fair partners, less waste.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class FilterValues {
  const FilterValues(this.sort, this.inStock, this.priceRange);
  final String sort;
  final bool inStock;
  final RangeValues priceRange;
}

class FilterSheet extends StatefulWidget {
  const FilterSheet({
    required this.sort,
    required this.inStock,
    required this.priceRange,
    super.key,
  });
  final String sort;
  final bool inStock;
  final RangeValues priceRange;

  @override
  State<FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<FilterSheet> {
  late String sort = widget.sort;
  late bool inStock = widget.inStock;
  late RangeValues priceRange = widget.priceRange;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        22,
        4,
        22,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Make it yours', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 24),
          const Text(
            'SORT BY',
            style: TextStyle(
              color: muted,
              fontSize: 10,
              letterSpacing: 1,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 9),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children:
                [
                      'Featured',
                      'Price: low to high',
                      'Price: high to low',
                      'Top rated',
                    ]
                    .map(
                      (value) => ChoiceChip(
                        label: Text(value),
                        selected: sort == value,
                        onSelected: (_) => setState(() => sort = value),
                      ),
                    )
                    .toList(),
          ),
          const SizedBox(height: 22),
          const Text(
            'PRICE RANGE',
            style: TextStyle(
              color: muted,
              fontSize: 10,
              letterSpacing: 1,
              fontWeight: FontWeight.w700,
            ),
          ),
          RangeSlider(
            min: 0,
            max: 250,
            divisions: 25,
            values: priceRange,
            labels: RangeLabels(
              '\$${priceRange.start.round()}',
              '\$${priceRange.end.round()}',
            ),
            onChanged: (value) => setState(() => priceRange = value),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('In stock only'),
            value: inStock,
            onChanged: (value) => setState(() => inStock = value),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => Navigator.pop(
                context,
                FilterValues(sort, inStock, priceRange),
              ),
              child: const Text('SHOW THE GOOD STUFF'),
            ),
          ),
        ],
      ),
    ),
  );
}

class ProductDetailPage extends StatefulWidget {
  const ProductDetailPage({
    required this.product,
    required this.favorite,
    required this.onFavorite,
    required this.onAdd,
    super.key,
  });
  final Product product;
  final bool favorite;
  final VoidCallback onFavorite;
  final void Function(int quantity, String option) onAdd;

  @override
  State<ProductDetailPage> createState() => _ProductDetailPageState();
}

class _ProductDetailPageState extends State<ProductDetailPage> {
  int quantity = 1;
  late bool favorite = widget.favorite;
  late String selectedOption = widget.product.options.first;

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final wide = MediaQuery.sizeOf(context).width > 720;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.arrow_back_rounded),
        ),
        title: const Wordmark(),
        centerTitle: true,
        actions: [
          IconButton(
            onPressed: () {
              widget.onFavorite();
              setState(() => favorite = !favorite);
            },
            icon: Icon(
              favorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
              color: favorite ? orange : ink,
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 28),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1050),
            child: wide
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(flex: 6, child: _image(product)),
                      const SizedBox(width: 40),
                      Expanded(flex: 5, child: _info(product)),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _image(product),
                      const SizedBox(height: 25),
                      _info(product),
                    ],
                  ),
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 10, 20, 14),
        child: FilledButton(
          onPressed: product.inStock
              ? () {
                  widget.onAdd(quantity, selectedOption);
                  Navigator.pop(context);
                }
              : null,
          style: FilledButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 17),
          ),
          child: Text(
            product.inStock
                ? 'ADD TO BAG  ·  \$${product.price * quantity}'
                : 'CURRENTLY SOLD OUT',
          ),
        ),
      ),
    );
  }

  Widget _image(Product product) =>
      AspectRatio(aspectRatio: 1, child: ProductImage(product: product));

  Widget _info(Product product) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        product.brand,
        style: const TextStyle(
          color: muted,
          fontSize: 11,
          letterSpacing: 1.25,
          fontWeight: FontWeight.w700,
        ),
      ),
      const SizedBox(height: 9),
      Text(product.name, style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 10),
      Row(
        children: [
          const Icon(Icons.star_rounded, color: orange, size: 18),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              '${product.rating}  ·  ${product.reviews} thoughtful reviews',
              style: const TextStyle(color: muted, fontSize: 12),
            ),
          ),
        ],
      ),
      const SizedBox(height: 18),
      Row(
        children: [
          Text(
            '\$${product.price}',
            style: const TextStyle(
              color: ink,
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (product.originalPrice != null) ...[
            const SizedBox(width: 9),
            Text(
              '\$${product.originalPrice}',
              style: const TextStyle(
                color: muted,
                decoration: TextDecoration.lineThrough,
              ),
            ),
          ],
        ],
      ),
      const SizedBox(height: 21),
      Text(product.description, style: Theme.of(context).textTheme.bodyLarge),
      const SizedBox(height: 22),
      const Divider(color: line),
      const SizedBox(height: 14),
      const DetailBullet(
        icon: Icons.eco_outlined,
        text: 'Thoughtful materials, made to last',
      ),
      const SizedBox(height: 12),
      const DetailBullet(
        icon: Icons.local_shipping_outlined,
        text: 'Complimentary delivery over \$75',
      ),
      const SizedBox(height: 22),
      const Text(
        'CHOOSE YOUR OPTION',
        style: TextStyle(
          color: muted,
          fontSize: 10,
          letterSpacing: 1,
          fontWeight: FontWeight.w700,
        ),
      ),
      const SizedBox(height: 9),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: product.options
            .map(
              (option) => ChoiceChip(
                label: Text(option),
                selected: selectedOption == option,
                onSelected: (_) => setState(() => selectedOption = option),
              ),
            )
            .toList(),
      ),
      const SizedBox(height: 18),
      if (product.inStock)
        Row(
          children: [
            const Text(
              'QUANTITY',
              style: TextStyle(
                color: muted,
                fontSize: 10,
                letterSpacing: 1,
                fontWeight: FontWeight.w700,
              ),
            ),
            const Spacer(),
            QuantitySelector(
              quantity: quantity,
              onChanged: (value) => setState(() => quantity = value),
            ),
          ],
        )
      else
        const Text(
          'This favorite is taking a little break. Check back soon.',
          style: TextStyle(color: orange, fontSize: 13),
        ),
    ],
  );
}

class DetailBullet extends StatelessWidget {
  const DetailBullet({required this.icon, required this.text, super.key});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, size: 18, color: green),
      const SizedBox(width: 10),
      Expanded(
        child: Text(text, style: const TextStyle(color: muted, fontSize: 12)),
      ),
    ],
  );
}

class QuantitySelector extends StatelessWidget {
  const QuantitySelector({
    required this.quantity,
    required this.onChanged,
    super.key,
  });
  final int quantity;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: line),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          visualDensity: VisualDensity.compact,
          onPressed: quantity > 1 ? () => onChanged(quantity - 1) : null,
          icon: const Icon(Icons.remove_rounded, size: 18),
        ),
        Text('$quantity', style: const TextStyle(fontWeight: FontWeight.w700)),
        IconButton(
          visualDensity: VisualDensity.compact,
          onPressed: quantity < 99 ? () => onChanged(quantity + 1) : null,
          icon: const Icon(Icons.add_rounded, size: 18),
        ),
      ],
    ),
  );
}

class CartPage extends StatefulWidget {
  const CartPage({
    required this.cart,
    required this.subtotal,
    required this.discount,
    required this.coupon,
    required this.onQuantity,
    required this.onRemove,
    required this.onCoupon,
    required this.onRemoveCoupon,
    required this.onShop,
    required this.onCheckout,
    super.key,
  });
  final List<CartLine> cart;
  final int subtotal;
  final int discount;
  final String? coupon;
  final void Function(CartLine, int) onQuantity;
  final ValueChanged<CartLine> onRemove;
  final bool Function(String) onCoupon;
  final VoidCallback onRemoveCoupon;
  final VoidCallback onShop;
  final VoidCallback onCheckout;

  @override
  State<CartPage> createState() => _CartPageState();
}

class _CartPageState extends State<CartPage> {
  final couponController = TextEditingController();
  String? couponError;

  @override
  void dispose() {
    couponController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.cart.isEmpty) {
      return EmptyState(
        icon: Icons.shopping_bag_outlined,
        title: 'Your bag is taking a breather',
        message: 'A few good things might be just what it needs.',
        action: 'FIND YOUR NEXT FAVORITE',
        onAction: widget.onShop,
      );
    }
    final wide = MediaQuery.sizeOf(context).width > 850;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 40),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1040),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Your bag',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 7),
              Text(
                '${widget.cart.fold<int>(0, (sum, line) => sum + line.quantity)} good things, on their way.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 25),
              if (wide)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 6, child: _lines()),
                    const SizedBox(width: 32),
                    Expanded(flex: 4, child: _summary()),
                  ],
                )
              else ...[
                _lines(),
                const SizedBox(height: 20),
                _summary(),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _lines() => Column(
    children: widget.cart
        .map(
          (line) => Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: CartLineTile(
              line: line,
              onQuantity: (change) => widget.onQuantity(line, change),
              onRemove: () => widget.onRemove(line),
            ),
          ),
        )
        .toList(),
  );

  Widget _summary() => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: line),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'A little order summary',
          style: TextStyle(
            color: ink,
            fontSize: 17,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 18),
        SummaryRow('Subtotal', '\$${widget.subtotal}'),
        const SizedBox(height: 11),
        if (widget.discount > 0) ...[
          SummaryRow(
            'Discount (${widget.coupon})',
            '-\$${widget.discount}',
            color: green,
          ),
          const SizedBox(height: 11),
        ],
        const SummaryRow('Shipping', 'Calculated at checkout'),
        const SizedBox(height: 15),
        const Divider(color: line),
        const SizedBox(height: 12),
        SummaryRow(
          'Estimated total',
          '\$${widget.subtotal - widget.discount}',
          strong: true,
        ),
        const SizedBox(height: 7),
        const Text(
          'Taxes and shipping are calculated at checkout.',
          style: TextStyle(color: muted, fontSize: 11),
        ),
        const SizedBox(height: 20),
        if (widget.coupon == null)
          Row(
            children: [
              Expanded(
                child: TextField(
                  key: const Key('coupon-code'),
                  controller: couponController,
                  textCapitalization: TextCapitalization.characters,
                  decoration: InputDecoration(
                    hintText: 'Gift or discount code',
                    errorText: couponError,
                  ),
                  onChanged: (_) {
                    if (couponError != null) setState(() => couponError = null);
                  },
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () => setState(() {
                  couponError = widget.onCoupon(couponController.text)
                      ? null
                      : 'Try WELCOME10';
                }),
                child: const Text('APPLY'),
              ),
            ],
          )
        else
          Row(
            children: [
              const Icon(Icons.local_offer_outlined, color: green, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${widget.coupon} applied',
                  style: const TextStyle(color: green),
                ),
              ),
              TextButton(
                onPressed: widget.onRemoveCoupon,
                child: const Text('REMOVE'),
              ),
            ],
          ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: widget.onCheckout,
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            child: const Text('CONTINUE TO CHECKOUT'),
          ),
        ),
        const SizedBox(height: 10),
        Center(
          child: TextButton(
            onPressed: widget.onShop,
            child: const Text('KEEP LOOKING AROUND'),
          ),
        ),
      ],
    ),
  );
}

class SummaryRow extends StatelessWidget {
  const SummaryRow(
    this.title,
    this.value, {
    this.color,
    this.strong = false,
    super.key,
  });
  final String title;
  final String value;
  final Color? color;
  final bool strong;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(
          title,
          style: TextStyle(
            color: color ?? (strong ? ink : muted),
            fontWeight: strong ? FontWeight.w700 : null,
          ),
        ),
      ),
      Text(
        value,
        style: TextStyle(
          color: color ?? ink,
          fontSize: strong ? 20 : 13,
          fontWeight: strong ? FontWeight.w800 : null,
        ),
      ),
    ],
  );
}

class CartLineTile extends StatelessWidget {
  const CartLineTile({
    required this.line,
    required this.onQuantity,
    required this.onRemove,
    super.key,
  });
  final CartLine line;
  final ValueChanged<int> onQuantity;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: lineColor),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Row(
      children: [
        SizedBox(
          width: 86,
          height: 96,
          child: ProductImage(product: line.product),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                line.product.brand,
                style: const TextStyle(
                  color: muted,
                  fontSize: 9,
                  letterSpacing: 1,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                line.product.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: ink,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                'Option: ${line.option}',
                style: const TextStyle(color: muted, fontSize: 11),
              ),
              const SizedBox(height: 6),
              QuantitySelector(
                quantity: line.quantity,
                onChanged: (value) => onQuantity(value - line.quantity),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            IconButton(
              tooltip: 'Remove item',
              visualDensity: VisualDensity.compact,
              onPressed: onRemove,
              icon: const Icon(Icons.close_rounded, size: 18),
            ),
            const SizedBox(height: 16),
            Text(
              '\$${line.product.price * line.quantity}',
              style: const TextStyle(
                color: ink,
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

const lineColor = Color(0xFFE9E7DF);

class CheckoutPage extends StatefulWidget {
  const CheckoutPage({
    required this.total,
    required this.onPlaceOrder,
    super.key,
  });
  final int total;
  final VoidCallback onPlaceOrder;

  @override
  State<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends State<CheckoutPage> {
  final formKey = GlobalKey<FormState>();
  final name = TextEditingController();
  final email = TextEditingController();
  final address = TextEditingController();
  final city = TextEditingController();
  final postal = TextEditingController();
  String shipping = 'Standard · Free';
  bool submitted = false;

  @override
  void dispose() {
    name.dispose();
    email.dispose();
    address.dispose();
    city.dispose();
    postal.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (submitted) return _success();
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.arrow_back_rounded),
        ),
        title: const Text('A few final details'),
      ),
      body: Form(
        key: formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            const CheckoutStep(step: '01', title: 'Contact'),
            const SizedBox(height: 14),
            _field(name, 'Full name', Icons.person_outline_rounded),
            const SizedBox(height: 11),
            _field(email, 'Email address', Icons.mail_outline_rounded, true),
            const SizedBox(height: 24),
            const CheckoutStep(step: '02', title: 'Delivery'),
            const SizedBox(height: 14),
            _field(address, 'Street address', Icons.home_outlined),
            const SizedBox(height: 11),
            Row(
              children: [
                Expanded(child: _field(city, 'City')),
                const SizedBox(width: 10),
                Expanded(child: _field(postal, 'Postal code')),
              ],
            ),
            const SizedBox(height: 19),
            DropdownButtonFormField<String>(
              initialValue: shipping,
              decoration: const InputDecoration(
                labelText: 'Shipping method',
                prefixIcon: Icon(Icons.local_shipping_outlined),
              ),
              items: const [
                DropdownMenuItem(
                  value: 'Standard · Free',
                  child: Text('Standard · Free'),
                ),
                DropdownMenuItem(
                  value: 'Express · \$12',
                  child: Text('Express · \$12'),
                ),
              ],
              onChanged: (value) {
                if (value != null) setState(() => shipping = value);
              },
            ),
            const SizedBox(height: 24),
            const CheckoutStep(step: '03', title: 'Payment'),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: line),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Row(
                children: [
                  Icon(Icons.lock_outline_rounded, color: green, size: 20),
                  SizedBox(width: 11),
                  Expanded(
                    child: Text(
                      'Secure payment options will appear when checkout is connected.',
                      style: TextStyle(color: muted, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 19),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFEEECE3),
                borderRadius: BorderRadius.circular(14),
              ),
              child: SummaryRow(
                'Order total',
                '\$${widget.total + (shipping == 'Express · \$12' ? 12 : 0)}',
                strong: true,
              ),
            ),
            const SizedBox(height: 17),
            FilledButton(
              onPressed: _placeOrder,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 17),
              ),
              child: const Text('PLACE DEMO ORDER'),
            ),
            const SizedBox(height: 11),
            const Text(
              'This preview does not submit personal information or charge a payment method.',
              textAlign: TextAlign.center,
              style: TextStyle(color: muted, fontSize: 10, height: 1.4),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, [
    IconData? icon,
    bool isEmail = false,
  ]) => TextFormField(
    controller: controller,
    keyboardType: isEmail ? TextInputType.emailAddress : TextInputType.text,
    textCapitalization: isEmail
        ? TextCapitalization.none
        : TextCapitalization.words,
    decoration: InputDecoration(
      labelText: label,
      prefixIcon: icon == null ? null : Icon(icon),
    ),
    validator: (value) {
      final text = value?.trim() ?? '';
      if (text.isEmpty) return 'Please enter ${label.toLowerCase()}';
      if (isEmail && !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(text)) {
        return 'Enter a valid email address';
      }
      return null;
    },
  );

  void _placeOrder() {
    if (!formKey.currentState!.validate()) return;
    widget.onPlaceOrder();
    setState(() => submitted = true);
  }

  Widget _success() => Scaffold(
    body: SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 74,
                height: 74,
                decoration: const BoxDecoration(
                  color: Color(0xFFE5EEE6),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check_rounded, color: green, size: 38),
              ),
              const SizedBox(height: 22),
              Text(
                'That’s a wrap.',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 10),
              const Text(
                'Your demo order is all set. Once the store is connected, this is where your real order confirmation will arrive.',
                textAlign: TextAlign.center,
                style: TextStyle(color: muted, height: 1.5),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('BACK TO THE GOOD THINGS'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class CheckoutStep extends StatelessWidget {
  const CheckoutStep({required this.step, required this.title, super.key});
  final String step;
  final String title;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Text(
        step,
        style: const TextStyle(
          color: orange,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
      const SizedBox(width: 10),
      Text(title, style: Theme.of(context).textTheme.titleMedium),
    ],
  );
}

class AccountPage extends StatelessWidget {
  const AccountPage({required this.onSaved, super.key});
  final VoidCallback onSaved;

  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 430),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Your corner.',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 7),
            Text(
              'A place for your orders and favorite things.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 25),
            Container(
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: line),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.person_outline_rounded,
                    color: green,
                    size: 28,
                  ),
                  const SizedBox(height: 13),
                  const Text(
                    'Good to see you.',
                    style: TextStyle(
                      color: ink,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 7),
                  const Text(
                    'Sign in or make an account to keep your orders and saved finds close.',
                    style: TextStyle(color: muted, height: 1.5),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => showDialog<void>(
                        context: context,
                        builder: (_) => const SignInDialog(),
                      ),
                      child: const Text('SIGN IN OR JOIN US'),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            AccountLink(
              icon: Icons.receipt_long_outlined,
              title: 'Your orders',
              subtitle: 'Keep an eye on good things on their way.',
              onTap: () => _comingSoon(context),
            ),
            AccountLink(
              icon: Icons.location_on_outlined,
              title: 'Addresses',
              subtitle: 'Make delivery day a little easier.',
              onTap: () => _comingSoon(context),
            ),
            AccountLink(
              icon: Icons.favorite_border_rounded,
              title: 'Saved pieces',
              subtitle: 'Your shortlist of everyday favorites.',
              onTap: onSaved,
            ),
            const SizedBox(height: 15),
            const Center(
              child: Text(
                'Thoughtfully chosen. Happily lived with.',
                style: TextStyle(
                  color: muted,
                  fontSize: 11,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );

  void _comingSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Account services will be connected in the next phase.'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

class AccountLink extends StatelessWidget {
  const AccountLink({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    super.key,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    onTap: onTap,
    contentPadding: const EdgeInsets.symmetric(vertical: 4),
    leading: Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        color: const Color(0xFFEEECE3),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, color: green, size: 20),
    ),
    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
    subtitle: Text(subtitle, style: const TextStyle(fontSize: 11)),
    trailing: const Icon(Icons.chevron_right_rounded, color: muted),
  );
}

class SignInDialog extends StatefulWidget {
  const SignInDialog({super.key});

  @override
  State<SignInDialog> createState() => _SignInDialogState();
}

class _SignInDialogState extends State<SignInDialog> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool register = false;
  bool showPassword = false;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(register ? 'Come on in.' : 'Welcome back.'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        TextField(
          controller: email,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(
            labelText: 'Email address',
            prefixIcon: Icon(Icons.mail_outline_rounded),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: password,
          obscureText: !showPassword,
          decoration: InputDecoration(
            labelText: 'Password',
            prefixIcon: const Icon(Icons.lock_outline_rounded),
            suffixIcon: IconButton(
              onPressed: () => setState(() => showPassword = !showPassword),
              icon: Icon(
                showPassword
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'This preview is offline. Account access will be connected to the secure store API.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => setState(() => register = !register),
        child: Text(register ? 'I HAVE AN ACCOUNT' : 'CREATE ACCOUNT'),
      ),
      FilledButton(
        onPressed: () {
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Account sign-in will be enabled after API integration.',
              ),
              behavior: SnackBarBehavior.floating,
            ),
          );
        },
        child: Text(register ? 'JOIN US' : 'SIGN IN'),
      ),
    ],
  );
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.icon,
    required this.title,
    required this.message,
    required this.action,
    required this.onAction,
    super.key,
  });
  final IconData icon;
  final String title;
  final String message;
  final String action;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(30),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: const BoxDecoration(
              color: Color(0xFFEEECE3),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 31, color: green),
          ),
          const SizedBox(height: 19),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 20),
          OutlinedButton(onPressed: onAction, child: Text(action)),
        ],
      ),
    ),
  );
}
