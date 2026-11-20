<?php
declare(strict_types=1);

namespace ToDublinAdmin;

final class ApiError extends \RuntimeException
{
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly string $errorCode = 'request_error',
        public readonly ?int $retryAfter = null
    ) {
        parent::__construct($message);
    }
}

final class App
{
    public const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
    public const MAX_PHOTO_PIXELS = 40_000_000;
    public const MAX_SELECTED_PHOTOS = 100;
    public const MAX_INVENTORY_PHOTOS = 1000;
    public const MAX_UPLOAD_FILES = 10;
    public const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
    private const SESSION_IDLE_SECONDS = 3600;
    private const SESSION_LIFETIME_SECONDS = 8 * 3600;
    private const LOGIN_WINDOW_SECONDS = 900;
    private const LOGIN_MAX_FAILURES = 8;

    public readonly string $root;
    public readonly string $privateDir;

    public function __construct(?string $root = null, ?string $privateDir = null)
    {
        $resolvedRoot = realpath($root ?? dirname(__DIR__));
        if ($resolvedRoot === false || !is_dir($resolvedRoot)) {
            throw new ApiError(503, 'Каталог сайта недоступен.', 'configuration_error');
        }
        $this->root = rtrim($resolvedRoot, DIRECTORY_SEPARATOR);
        $privateDir ??= getenv('TO_DUBLIN_PRIVATE_DIR') ?: dirname($this->root) . '/to-dublin-private';
        if ($privateDir === '' || $privateDir[0] !== '/' || str_contains($privateDir, "\0")) {
            throw new ApiError(503, 'Задайте абсолютный путь TO_DUBLIN_PRIVATE_DIR вне папки сайта.', 'configuration_error');
        }
        $candidate = self::canonicalFuturePath($privateDir);
        $webRoots = [$this->root];
        $documentRootValue = (string) ($_SERVER['DOCUMENT_ROOT'] ?? '');
        $documentRoot = $documentRootValue !== '' ? realpath($documentRootValue) : false;
        if ($documentRoot !== false && $documentRoot !== '' && $documentRoot !== '/') {
            $webRoots[] = rtrim($documentRoot, '/');
        }
        foreach ($webRoots as $webRoot) {
            if ($candidate === $webRoot || str_starts_with($candidate, $webRoot . '/')) {
                throw new ApiError(503, 'Приватный каталог админки должен находиться вне webroot. Задайте TO_DUBLIN_PRIVATE_DIR.', 'configuration_error');
            }
        }
        $this->privateDir = $candidate;
        $this->ensureDirectory($candidate, 0700);
        if (realpath($candidate) !== $candidate || !is_writable($candidate)) {
            throw new ApiError(503, 'Приватный каталог админки недоступен для записи.', 'configuration_error');
        }
    }

    private static function canonicalFuturePath(string $path): string
    {
        $segments = [];
        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.') continue;
            if ($segment === '..') { array_pop($segments); continue; }
            $segments[] = $segment;
        }
        $normalized = '/' . implode('/', $segments);
        $tail = [];
        $existing = $normalized;
        while (!file_exists($existing) && !is_link($existing) && $existing !== '/') {
            array_unshift($tail, basename($existing));
            $existing = dirname($existing);
        }
        $real = realpath($existing);
        if ($real === false) {
            throw new ApiError(503, 'Не удалось определить приватный каталог.', 'configuration_error');
        }
        return rtrim($real, '/') . ($tail ? '/' . implode('/', $tail) : '');
    }

    private function ensureDirectory(string $path, int $mode): void
    {
        if (is_link($path)) {
            throw new ApiError(503, 'Символические ссылки для рабочих каталогов не поддерживаются.', 'configuration_error');
        }
        if (!is_dir($path) && !@mkdir($path, $mode, true) && !is_dir($path)) {
            throw new ApiError(503, 'Не удалось создать рабочий каталог. Проверьте права хостинга.', 'configuration_error');
        }
        if ($mode === 0700 && !@chmod($path, $mode)) {
            throw new ApiError(503, 'Не удалось ограничить доступ к приватному каталогу.', 'configuration_error');
        }
    }

    public function credentials(): ?array
    {
        $path = $this->privateDir . '/auth.json';
        if (is_link($path)) {
            throw new ApiError(503, 'Недопустимый файл настроек входа.', 'configuration_error');
        }
        if (!is_file($path)) return null;
        if (filesize($path) > 8192) {
            throw new ApiError(503, 'Файл настроек входа повреждён.', 'configuration_error');
        }
        $data = json_decode((string) file_get_contents($path), true);
        if (!is_array($data) || !is_string($data['passwordHash'] ?? null)
            || !is_string($data['epoch'] ?? null) || !preg_match('/^[a-f0-9]{32}$/D', $data['epoch'])
            || !is_string($data['rateSalt'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $data['rateSalt'])
            || (password_get_info($data['passwordHash'])['algoName'] ?? 'unknown') === 'unknown') {
            throw new ApiError(503, 'Настройки входа повреждены. Повторите CLI-настройку.', 'configuration_error');
        }
        return $data;
    }

    public function setPassword(string $password): void
    {
        if (PHP_SAPI !== 'cli') throw new ApiError(403, 'Изменение пароля доступно только через CLI.', 'forbidden');
        if (strlen($password) < 12 || strlen($password) > 72 || str_contains($password, "\0")) {
            throw new ApiError(422, 'Пароль должен содержать от 12 до 72 байт.', 'invalid_password');
        }
        $hash = password_hash($password, PASSWORD_DEFAULT);
        if ($hash === false) throw new ApiError(500, 'Не удалось подготовить пароль.', 'internal_error');
        $this->atomicWrite($this->privateDir . '/auth.json', self::encode([
            'passwordHash' => $hash,
            'epoch' => bin2hex(random_bytes(16)),
            'rateSalt' => bin2hex(random_bytes(32)),
        ]), 0600);
    }

    public function beginSession(bool $secure, string $cookiePath): void
    {
        $dir = $this->privateDir . '/sessions';
        $this->ensureDirectory($dir, 0700);
        if (session_status() === PHP_SESSION_ACTIVE) return;
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_trans_sid', '0');
        ini_set('session.gc_maxlifetime', (string) self::SESSION_IDLE_SECONDS);
        session_save_path($dir);
        session_name('TD_DUBLIN_ADMIN');
        session_set_cookie_params([
            'lifetime' => 0, 'path' => $cookiePath, 'secure' => $secure,
            'httponly' => true, 'samesite' => 'Strict',
        ]);
        if (!session_start()) throw new ApiError(503, 'Не удалось открыть сессию админки.', 'session_error');
    }

    public function authenticated(): bool
    {
        $credentials = $this->credentials();
        $now = time();
        $valid = $credentials !== null && isset($_SESSION['adminEpoch'], $_SESSION['issuedAt'], $_SESSION['lastSeen'], $_SESSION['csrf'])
            && is_string($_SESSION['adminEpoch']) && hash_equals($credentials['epoch'], $_SESSION['adminEpoch'])
            && is_int($_SESSION['issuedAt']) && is_int($_SESSION['lastSeen']) && is_string($_SESSION['csrf'])
            && $_SESSION['issuedAt'] <= $now && $_SESSION['lastSeen'] <= $now + 300
            && $now - $_SESSION['issuedAt'] <= self::SESSION_LIFETIME_SECONDS
            && $now - $_SESSION['lastSeen'] <= self::SESSION_IDLE_SECONDS;
        if ($valid) $_SESSION['lastSeen'] = $now;
        else if (isset($_SESSION['adminEpoch'])) $this->clearAuthentication();
        return $valid;
    }

    public function requireAuthentication(): void
    {
        if (!$this->authenticated()) throw new ApiError(401, 'Войдите в админку ещё раз.', 'authentication_required');
    }

    public function verifyCsrf(string $token): void
    {
        if ($token === '' || !is_string($_SESSION['csrf'] ?? null) || !hash_equals($_SESSION['csrf'], $token)) {
            throw new ApiError(403, 'Проверка сессии не пройдена. Обновите страницу и войдите снова.', 'csrf_failed');
        }
    }

    public function sessionInfo(): array
    {
        $authenticated = $this->authenticated();
        $result = ['configured' => $this->credentials() !== null, 'authenticated' => $authenticated];
        if ($authenticated) $result['csrf'] = $_SESSION['csrf'];
        return $result;
    }

    public function login(string $password, string $address): array
    {
        $credentials = $this->credentials();
        if ($credentials === null) {
            throw new ApiError(503, 'Админка ещё не настроена. Установите пароль через admin/manage.php на хостинге.', 'not_configured');
        }
        $dir = $this->privateDir . '/attempts';
        $this->ensureDirectory($dir, 0700);
        $key = hash_hmac('sha256', $address, $credentials['rateSalt']);
        $path = $dir . '/' . $key . '.json';
        if (is_link($path)) throw new ApiError(503, 'Защита входа временно недоступна.', 'configuration_error');
        $handle = @fopen($path, 'c+');
        if ($handle === false || !@flock($handle, LOCK_EX)) {
            if (is_resource($handle)) fclose($handle);
            throw new ApiError(503, 'Защита входа временно недоступна.', 'configuration_error');
        }
        @chmod($path, 0600);
        try {
            $attempt = json_decode(stream_get_contents($handle, 4096) ?: '{}', true);
            $now = time();
            if (!is_array($attempt) || !is_int($attempt['started'] ?? null) || !is_int($attempt['failures'] ?? null)
                || $attempt['started'] > $now || $now - $attempt['started'] >= self::LOGIN_WINDOW_SECONDS) {
                $attempt = ['started' => $now, 'failures' => 0];
            }
            if ($attempt['failures'] >= self::LOGIN_MAX_FAILURES) {
                throw new ApiError(429, 'Слишком много попыток. Попробуйте войти позднее.', 'rate_limited', max(1, self::LOGIN_WINDOW_SECONDS - ($now - $attempt['started'])));
            }
            $correct = strlen($password) >= 12 && strlen($password) <= 72 && !str_contains($password, "\0")
                && password_verify($password, $credentials['passwordHash']);
            $attempt['failures'] = $correct ? 0 : $attempt['failures'] + 1;
            rewind($handle);
            if (!ftruncate($handle, 0) || fwrite($handle, json_encode($attempt, JSON_THROW_ON_ERROR)) === false || !fflush($handle)) {
                throw new ApiError(503, 'Защита входа временно недоступна.', 'configuration_error');
            }
            if (!$correct) throw new ApiError(401, 'Неверный пароль.', 'invalid_credentials');
        } finally {
            flock($handle, LOCK_UN); fclose($handle);
        }
        if (!session_regenerate_id(true)) throw new ApiError(503, 'Не удалось обновить сессию.', 'session_error');
        $_SESSION = [
            'adminEpoch' => $credentials['epoch'], 'issuedAt' => time(), 'lastSeen' => time(),
            'csrf' => bin2hex(random_bytes(32)),
        ];
        return $this->sessionInfo();
    }

    public function logout(): array
    {
        $this->clearAuthentication();
        return ['configured' => $this->credentials() !== null, 'authenticated' => false];
    }

    private function clearAuthentication(): void
    {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) session_regenerate_id(true);
    }

    public function files(): array
    {
        $dir = $this->photoDirectory();
        $files = [];
        foreach (new \DirectoryIterator($dir) as $entry) {
            if (!$entry->isFile() || $entry->isLink() || !self::validFilename($entry->getFilename())) continue;
            $item = $this->inspectPhoto($entry->getPathname(), $entry->getFilename());
            if ($item === null) continue;
            $files[] = $item;
            if (count($files) > self::MAX_INVENTORY_PHOTOS) {
                throw new ApiError(422, 'В папке больше 1000 фотографий. Уменьшите её объём.', 'too_many_files');
            }
        }
        usort($files, static fn(array $a, array $b): int => strnatcasecmp($a['file'], $b['file']));
        return $files;
    }

    private function photoDirectory(): string
    {
        $path = $this->root . '/media/gallery/photos';
        $this->ensureDirectory($path, 0755);
        $real = realpath($path);
        if ($real === false || !str_starts_with($real, $this->root . '/') || is_link($path)) {
            throw new ApiError(503, 'Недопустимый каталог фотографий.', 'configuration_error');
        }
        return $path;
    }

    public static function validFilename(string $name): bool
    {
        return $name !== '' && strlen($name) <= 240 && $name[0] !== '.' && !str_contains($name, '..')
            && !str_contains($name, '/') && !str_contains($name, '\\') && !preg_match('/[\x00-\x1f\x7f]/', $name)
            && preg_match('//u', $name) === 1
            && in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), ['jpg', 'jpeg', 'png', 'webp'], true);
    }

    public function inspectPhoto(string $path, string $name): ?array
    {
        if (!self::validFilename($name) || is_link($path) || !is_file($path)) return null;
        $bytes = filesize($path);
        if ($bytes === false || $bytes < 1 || $bytes > self::MAX_PHOTO_BYTES) return null;
        if (!class_exists(\finfo::class)) throw new ApiError(503, 'На хостинге требуется расширение PHP Fileinfo.', 'configuration_error');
        $type = (new \finfo(FILEINFO_MIME_TYPE))->file($path);
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $allowed = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
        if (($allowed[$extension] ?? null) !== $type) return null;
        $info = @getimagesize($path);
        if (!is_array($info) || ($info['mime'] ?? '') !== $type || !isset($info[0], $info[1])
            || $info[0] <= 0 || $info[1] <= 0 || $info[0] > 20_000 || $info[1] > 20_000
            || $info[0] * $info[1] > self::MAX_PHOTO_PIXELS) return null;
        return [
            'file' => $name, 'width' => $info[0], 'height' => $info[1], 'bytes' => $bytes,
            'url' => '../media/gallery/photos/' . rawurlencode($name),
        ];
    }

    public function validateContent(mixed $raw, ?array $availableFiles = null): array
    {
        if (!is_array($raw) || ($raw['schemaVersion'] ?? null) !== 1 || !is_array($raw['pricing'] ?? null)
            || !is_array($raw['gallery'] ?? null) || !is_array($raw['gallery']['items'] ?? null)
            || !array_is_list($raw['gallery']['items'])) {
            throw new ApiError(422, 'Некорректный формат настроек сайта.', 'invalid_content');
        }
        $pricing = [];
        foreach (['base', 'generatorDiscount', 'barrelDiscount', 'extraHour', 'extraKeg'] as $key) {
            $value = $raw['pricing'][$key] ?? null;
            if (!is_int($value) || $value < ($key === 'extraKeg' ? 1 : 0) || $value > 100_000_000) {
                throw new ApiError(422, 'Все цены должны быть целыми рублями от 0 до 100 000 000; дополнительный кег — от 1 рубля.', 'invalid_pricing');
            }
            $pricing[$key] = $value;
        }
        if ($pricing['base'] < $pricing['generatorDiscount'] + 7 * $pricing['barrelDiscount']) {
            throw new ApiError(422, 'Базовая цена не может быть меньше суммы скидок за генератор и семь столов-бочек.', 'invalid_pricing');
        }
        if (count($raw['gallery']['items']) > self::MAX_SELECTED_PHOTOS) {
            throw new ApiError(422, 'В галерее может быть не больше 100 фотографий.', 'too_many_selected');
        }
        $available = $availableFiles === null ? null : array_fill_keys(array_column($availableFiles, 'file'), true);
        $items = []; $seen = [];
        foreach ($raw['gallery']['items'] as $item) {
            if (!is_array($item) || !is_string($item['file'] ?? null) || !self::validFilename($item['file'])) {
                throw new ApiError(422, 'Выберите фотографию из папки media/gallery/photos.', 'invalid_photo');
            }
            $file = $item['file'];
            if (isset($seen[$file])) throw new ApiError(422, 'Фотографии в галерее не должны повторяться.', 'duplicate_photo');
            if ($available !== null && !isset($available[$file])) {
                throw new ApiError(422, 'Выбранная фотография отсутствует или не поддерживается: ' . $file, 'missing_photo');
            }
            $seen[$file] = true;
            $caption = self::validatedText($item['caption'] ?? '', 120);
            $alt = self::validatedText($item['alt'] ?? '', 240);
            $items[] = ['file' => $file, 'caption' => $caption, 'alt' => $alt];
        }
        return ['schemaVersion' => 1, 'pricing' => $pricing, 'gallery' => ['items' => $items]];
    }

    private static function validatedText(mixed $value, int $limit): string
    {
        if (!is_string($value) || preg_match('//u', $value) !== 1 || preg_match('/[\x00-\x1f\x7f]/', $value)) {
            throw new ApiError(422, 'Подписи фотографий должны быть обычным текстом в одну строку.', 'invalid_text');
        }
        $length = preg_match_all('/./us', $value);
        if ($length === false || $length > $limit) {
            throw new ApiError(422, 'Слишком длинная подпись фотографии.', 'invalid_text');
        }
        return trim($value);
    }

    private function contentPath(): string
    {
        $dir = $this->root . '/data';
        if (!is_dir($dir) || is_link($dir) || !str_starts_with((string) realpath($dir), $this->root . '/')) {
            throw new ApiError(503, 'Папка data недоступна. Загрузите комплект файлов сайта на хостинг.', 'configuration_error');
        }
        $path = $dir . '/site-content.json';
        if (is_link($path)) throw new ApiError(503, 'Недопустимый файл настроек сайта.', 'configuration_error');
        return $path;
    }

    public function snapshot(bool $withFiles = true): array
    {
        $path = $this->contentPath();
        if (!is_file($path) || filesize($path) > 512 * 1024) {
            throw new ApiError(503, 'Файл data/site-content.json отсутствует или повреждён.', 'configuration_error');
        }
        $text = file_get_contents($path);
        if ($text === false) throw new ApiError(503, 'Не удалось прочитать настройки сайта.', 'configuration_error');
        $raw = json_decode($text, true);
        if (json_last_error() !== JSON_ERROR_NONE) throw new ApiError(503, 'Файл настроек сайта содержит ошибку JSON.', 'configuration_error');
        $content = $this->validateContent($raw);
        $result = ['content' => $content, 'revision' => hash('sha256', $text)];
        if ($withFiles) $result['files'] = $this->files();
        return $result;
    }

    public function save(mixed $raw, mixed $expectedRevision): array
    {
        if (!is_string($expectedRevision) || !preg_match('/^[a-f0-9]{64}$/D', $expectedRevision)) {
            throw new ApiError(422, 'Не указана версия настроек. Обновите данные в админке.', 'invalid_revision');
        }
        $lockPath = $this->privateDir . '/content.lock';
        if (is_link($lockPath)) throw new ApiError(503, 'Недопустимый файл блокировки.', 'configuration_error');
        $lock = @fopen($lockPath, 'c+');
        if ($lock === false || !flock($lock, LOCK_EX)) {
            if (is_resource($lock)) fclose($lock);
            throw new ApiError(503, 'Сохранение временно недоступно. Повторите позже.', 'write_failed');
        }
        @chmod($lockPath, 0600);
        try {
            $current = $this->snapshot(false);
            if (!hash_equals($current['revision'], $expectedRevision)) {
                throw new ApiError(409, 'Настройки уже изменены в другой вкладке. Сначала загрузите актуальную версию.', 'revision_conflict');
            }
            $content = $this->validateContent($raw, $this->files());
            $this->atomicWrite($this->contentPath(), self::encode($content), 0644);
            return $this->snapshot(false);
        } finally {
            flock($lock, LOCK_UN); fclose($lock);
        }
    }

    private function atomicWrite(string $path, string $text, int $mode): void
    {
        if (is_link($path)) throw new ApiError(503, 'Недопустимый файл для записи.', 'configuration_error');
        $temporary = @tempnam(dirname($path), '.td-write-');
        if ($temporary === false || dirname($temporary) !== dirname($path)) {
            if (is_string($temporary)) @unlink($temporary);
            throw new ApiError(503, 'Не удалось сохранить файл. Проверьте права папки.', 'write_failed');
        }
        $handle = null;
        try {
            $handle = @fopen($temporary, 'wb');
            if ($handle === false || fwrite($handle, $text) !== strlen($text) || !fflush($handle)) {
                throw new ApiError(503, 'Не удалось записать настройки.', 'write_failed');
            }
            if (function_exists('fsync')) @fsync($handle);
            fclose($handle); $handle = null;
            if (!@chmod($temporary, $mode) || !@rename($temporary, $path)) {
                throw new ApiError(503, 'Не удалось заменить файл настроек.', 'write_failed');
            }
        } finally {
            if (is_resource($handle)) fclose($handle);
            if (is_file($temporary)) @unlink($temporary);
        }
    }

    private static function encode(array $value): string
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n";
    }

    public function upload(array $input): array
    {
        if (!isset($input['name'], $input['tmp_name'], $input['error'], $input['size'])
            || !is_array($input['name']) || !is_array($input['tmp_name']) || !is_array($input['error']) || !is_array($input['size'])) {
            throw new ApiError(422, 'Выберите фотографии для загрузки.', 'no_files');
        }
        $count = count($input['name']);
        if ($count < 1 || $count > self::MAX_UPLOAD_FILES || count($input['tmp_name']) !== $count
            || count($input['error']) !== $count || count($input['size']) !== $count) {
            throw new ApiError(422, 'За один раз можно загрузить от 1 до 10 фотографий.', 'upload_limit');
        }
        $existing = $this->files();
        if (count($existing) + $count > self::MAX_INVENTORY_PHOTOS) {
            throw new ApiError(422, 'В папке может быть не больше 1000 фотографий.', 'too_many_files');
        }
        $prepared = []; $total = 0;
        for ($i = 0; $i < $count; $i++) {
            $error = $input['error'][$i] ?? UPLOAD_ERR_NO_FILE;
            if ($error !== UPLOAD_ERR_OK) {
                $tooLarge = in_array($error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
                throw new ApiError($tooLarge ? 413 : 422, $tooLarge ? 'Файл превышает разрешённый хостингом размер.' : 'Файл не загружен полностью. Повторите загрузку.', 'upload_failed');
            }
            $temp = $input['tmp_name'][$i] ?? null;
            $name = $input['name'][$i] ?? null;
            if (!is_string($temp) || !is_string($name) || !is_uploaded_file($temp)) {
                throw new ApiError(422, 'Недопустимый загруженный файл.', 'invalid_upload');
            }
            // PHP may strip path components from name; full_path retains them.
            $fullPath = $input['full_path'][$i] ?? $name;
            if (!is_string($fullPath) || $fullPath !== $name) {
                throw new ApiError(422, 'Загружайте отдельные фотографии без путей и подкаталогов.', 'invalid_upload');
            }
            $meta = $this->inspectPhoto($temp, $name);
            if ($meta === null) {
                throw new ApiError(422, 'Поддерживаются JPEG, PNG и WebP до 10 МБ и 40 мегапикселей. Название файла должно быть без путей.', 'invalid_upload');
            }
            $total += $meta['bytes'];
            if ($total > self::MAX_UPLOAD_BYTES) throw new ApiError(413, 'Суммарный размер загрузки — не больше 40 МБ.', 'upload_limit');
            $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            if ($extension === 'jpeg') $extension = 'jpg';
            $filename = gmdate('Ymd-His') . '-' . bin2hex(random_bytes(8)) . '.' . $extension;
            $prepared[] = ['temp' => $temp, 'file' => $filename];
        }
        $dir = $this->photoDirectory();
        $moved = []; $result = [];
        try {
            foreach ($prepared as $file) {
                $target = $dir . '/' . $file['file'];
                if (file_exists($target) || !@move_uploaded_file($file['temp'], $target)) {
                    throw new ApiError(503, 'Не удалось сохранить фотографии. Проверьте права папки media/gallery/photos.', 'write_failed');
                }
                $moved[] = $target;
                if (!@chmod($target, 0644)) throw new ApiError(503, 'Не удалось настроить доступ к фотографии.', 'write_failed');
                $meta = $this->inspectPhoto($target, $file['file']);
                if ($meta === null) throw new ApiError(422, 'Не удалось проверить сохранённую фотографию.', 'invalid_upload');
                $result[] = $meta;
            }
        } catch (\Throwable $error) {
            foreach ($moved as $path) @unlink($path);
            throw $error;
        }
        return ['files' => $result];
    }
}

function isHttps(): bool
{
    return (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
}

function requestOrigin(): string
{
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    if ($host === '' || preg_match('/[^a-zA-Z0-9.\-:\[\]]/', $host)) {
        throw new ApiError(400, 'Некорректный адрес сайта.', 'invalid_host');
    }
    $scheme = isHttps() ? 'https' : 'http';
    $parsed = parse_url($scheme . '://' . $host);
    if (!is_array($parsed) || !isset($parsed['host'])) throw new ApiError(400, 'Некорректный адрес сайта.', 'invalid_host');
    $port = $parsed['port'] ?? ($scheme === 'https' ? 443 : 80);
    return $scheme . '://' . strtolower($parsed['host']) . (($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80) ? '' : ':' . $port);
}

function requireSecureTransport(): void
{
    if (isHttps()) return;
    $origin = requestOrigin();
    $host = strtolower((string) parse_url($origin, PHP_URL_HOST));
    if (!in_array($host, ['localhost', '127.0.0.1', '[::1]', '::1'], true)) {
        throw new ApiError(403, 'Админка доступна только по HTTPS.', 'https_required');
    }
}

function requireSameOrigin(): void
{
    $expected = requestOrigin();
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    if (is_string($origin) && $origin !== '') {
        if (!hash_equals($expected, strtolower(rtrim($origin, '/')))) {
            throw new ApiError(403, 'Запрос должен быть отправлен с этого же сайта.', 'origin_failed');
        }
        return;
    }
    $referer = (string) ($_SERVER['HTTP_REFERER'] ?? '');
    $parts = parse_url($referer);
    if (is_array($parts) && isset($parts['scheme'], $parts['host']) && ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'same-origin') {
        $port = $parts['port'] ?? ($parts['scheme'] === 'https' ? 443 : 80);
        $actual = strtolower($parts['scheme'] . '://' . $parts['host'])
            . (($parts['scheme'] === 'https' && $port === 443) || ($parts['scheme'] === 'http' && $port === 80) ? '' : ':' . $port);
        if (hash_equals($expected, $actual)) return;
    }
    throw new ApiError(403, 'Не удалось подтвердить адрес страницы. Откройте админку на своём сайте.', 'origin_failed');
}

function jsonBody(): array
{
    $type = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    if ($type !== 'application/json') throw new ApiError(415, 'Для запроса требуется JSON.', 'unsupported_content_type');
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > 512 * 1024) throw new ApiError(413, 'Слишком большой запрос.', 'request_too_large');
    $raw = file_get_contents('php://input', false, null, 0, 512 * 1024 + 1);
    if ($raw === false || strlen($raw) > 512 * 1024) throw new ApiError(413, 'Слишком большой запрос.', 'request_too_large');
    $body = json_decode($raw, true);
    if (!is_array($body) || json_last_error() !== JSON_ERROR_NONE) throw new ApiError(400, 'Некорректный JSON.', 'invalid_json');
    return $body;
}

function iniBytes(string $value): int
{
    $value = trim($value);
    if ($value === '' || $value === '0' || $value === '-1') return 0;
    $number = (int) $value;
    return match (strtolower(substr($value, -1))) {
        'g' => $number * 1024 * 1024 * 1024,
        'm' => $number * 1024 * 1024,
        'k' => $number * 1024,
        default => $number,
    };
}
