import 'package:http/browser_client.dart' as browser;
import 'package:http/http.dart' as http;

http.Client createApiHttpClient() =>
    browser.BrowserClient()..withCredentials = true;

const supportsManualCookies = false;
