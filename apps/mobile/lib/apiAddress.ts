export type Runtime = {
  platform: string;
  isDevice: boolean;
  development: boolean;
  metroHost?: string | null;
  browserUrl?: string | null;
  genericUrl?: string;
  platformUrl?: string;
  apiPort?: string;
};
export type ApiAddress = { url: string; source: string; warnings: string[]; error?: string };
const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1', '10.0.2.2']);
// Read-only parsing also works with React Native's partial URL implementation.
function parse(value: string) {
  const match =
    /^(https?):\/\/(\[[\da-f:]+\]|[a-z\d](?:[a-z\d.-]*[a-z\d])?)(?::(\d+))?(\/[^?#\s]*)?$/i.exec(
      value.trim(),
    );
  if (!match) return null;
  const port = match[3] || '';
  if (port && (Number(port) < 1 || Number(port) > 65535)) return null;
  return {
    protocol: match[1]!.toLowerCase(),
    host: match[2]!.toLowerCase(),
    port,
    path: (match[4] || '').replace(/\/+$/, ''),
  };
}
function metroHostname(value?: string | null) {
  if (!value) return null;
  return (
    parse(value.includes('://') ? value.replace(/^exps?:\/\//, 'http://') : 'http://' + value)
      ?.host || null
  );
}
export function resolveApiAddress(runtime: Runtime): ApiAddress {
  const warnings: string[] = [];
  const invalid = (message: string): ApiAddress => ({
    url: '',
    source: 'Cấu hình không hợp lệ',
    warnings,
    error: message + ' Sửa apps/mobile/.env rồi dừng và chạy lại Expo.',
  });
  const specific = runtime.platformUrl?.trim();
  const generic = runtime.genericUrl?.trim();
  const configured =
    specific && specific.toLowerCase() !== 'auto'
      ? specific
      : generic && generic.toLowerCase() !== 'auto'
        ? generic
        : null;
  const port = runtime.apiPort?.trim() || '4000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    return invalid('EXPO_PUBLIC_API_PORT phải là cổng từ 1 đến 65535.');
  const browser = runtime.browserUrl ? parse(runtime.browserUrl.split(/[?#]/)[0]!) : null;
  let source = configured
    ? specific && specific.toLowerCase() !== 'auto'
      ? 'Biến theo nền tảng'
      : 'EXPO_PUBLIC_API_URL'
    : 'Tự động theo thiết bị';
  let address = configured ? parse(configured) : null;
  if (configured && !address)
    return invalid(
      'URL API cần dạng http://host:port hoặc https://domain, không có mật khẩu/query/hash.',
    );
  if (!address) {
    if (!runtime.development) {
      if (runtime.platform === 'web' && browser)
        return {
          url: `${browser.protocol}://${browser.host}${browser.port ? ':' + browser.port : ''}`,
          source: 'Cùng origin với web',
          warnings,
        };
      return invalid('Bản native phát hành cần cấu hình EXPO_PUBLIC_API_URL trỏ tới API HTTPS.');
    }
    let host: string | null = null;
    if (runtime.platform === 'web') host = browser?.host || 'localhost';
    else if (runtime.platform === 'android' && !runtime.isDevice) host = '10.0.2.2';
    else if (runtime.platform === 'ios' && !runtime.isDevice) host = 'localhost';
    else host = metroHostname(runtime.metroHost);
    if (!host || (runtime.isDevice && runtime.platform !== 'web' && localHosts.has(host)))
      return invalid(
        'Không xác định được IP máy chạy API. Với điện thoại thật, đặt URL bằng IPv4 Wi-Fi của máy tính.',
      );
    if (/(?:\.exp\.direct|\.exp\.host|\.ngrok(?:-free)?\.(?:app|io))$/.test(host))
      return invalid(
        'Expo tunnel chỉ tải mã ứng dụng; cần URL API riêng truy cập được từ điện thoại.',
      );
    address = { protocol: 'http', host, port, path: '' };
  }
  // Fix legacy shared localhost/Android-emulator settings in development only.
  // An explicit platform override is never rewritten (e.g. adb reverse).
  if (runtime.development && configured && !(specific && specific.toLowerCase() !== 'auto')) {
    let host = address.host;
    if (runtime.platform === 'web' && localHosts.has(host)) host = browser?.host || 'localhost';
    else if (runtime.platform === 'android' && !runtime.isDevice && localHosts.has(host))
      host = '10.0.2.2';
    else if (runtime.platform === 'ios' && !runtime.isDevice && localHosts.has(host))
      host = 'localhost';
    else if (runtime.platform !== 'web' && runtime.isDevice && localHosts.has(host)) {
      const detected = metroHostname(runtime.metroHost);
      if (!detected || localHosts.has(detected) || /\.exp\.direct$/.test(detected))
        return invalid(
          'URL localhost/10.0.2.2 không dùng cho điện thoại thật. Đặt IP Wi-Fi máy tính hoặc URL API HTTPS.',
        );
      host = detected;
    }
    if (host !== address.host) {
      warnings.push(`Đã đổi địa chỉ cục bộ ${address.host} thành ${host} cho ${runtime.platform}.`);
      address = { ...address, host };
      source += ' · hiệu chỉnh thiết bị';
    }
  }
  if (address.path.endsWith('/api')) {
    address = { ...address, path: address.path.slice(0, -4) };
    warnings.push('Đã bỏ hậu tố /api vì ứng dụng tự thêm đường dẫn này.');
  }
  if (runtime.platform === 'web' && browser?.protocol === 'https' && address.protocol === 'http')
    warnings.push('Web HTTPS có thể chặn API HTTP (mixed content). Cấu hình API HTTPS.');
  return {
    url: `${address.protocol}://${address.host}${address.port ? ':' + address.port : ''}${address.path}`,
    source,
    warnings,
  };
}
