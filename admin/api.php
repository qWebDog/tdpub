<?php
declare(strict_types=1);

use ToDublinAdmin\ApiError;
use ToDublinAdmin\App;

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cross-Origin-Resource-Policy: same-origin');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

require_once __DIR__ . '/lib.php';

try {
    ToDublinAdmin\requireSecureTransport();
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = $_GET['action'] ?? 'session';
    if (!is_string($action)) throw new ApiError(400, 'Неизвестное действие.', 'unknown_action');
    $methods = ['session' => 'GET', 'content' => 'GET', 'login' => 'POST', 'logout' => 'POST', 'save' => 'POST', 'upload' => 'POST'];
    if (!isset($methods[$action])) throw new ApiError(404, 'Неизвестное действие.', 'unknown_action');
    if ($methods[$action] !== $method) {
        header('Allow: ' . $methods[$action]);
        throw new ApiError(405, 'Этот HTTP-метод не поддерживается.', 'method_not_allowed');
    }
    if ($method === 'POST') ToDublinAdmin\requireSameOrigin();
    $app = new App();
    $path = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/admin/api.php'))), '/') . '/';
    $app->beginSession(ToDublinAdmin\isHttps(), $path);
    if (!in_array($action, ['session', 'login'], true)) $app->requireAuthentication();
    if ($method === 'POST' && $action !== 'login') $app->verifyCsrf((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));

    $result = match ($action) {
        'session' => $app->sessionInfo(),
        'content' => $app->snapshot(),
        'login' => (static function () use ($app): array {
            $body = ToDublinAdmin\jsonBody();
            if (!is_string($body['password'] ?? null)) throw new ApiError(400, 'Введите пароль.', 'invalid_request');
            return $app->login($body['password'], (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
        })(),
        'logout' => (static function () use ($app): array {
            ToDublinAdmin\jsonBody();
            return $app->logout();
        })(),
        'save' => (static function () use ($app): array {
            $body = ToDublinAdmin\jsonBody();
            return $app->save($body['content'] ?? null, $body['revision'] ?? null);
        })(),
        'upload' => (static function () use ($app): array {
            $type = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
            if (!str_starts_with($type, 'multipart/form-data;')) {
                throw new ApiError(415, 'Для загрузки фотографий требуется multipart/form-data.', 'unsupported_content_type');
            }
            $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
            $hostLimit = ToDublinAdmin\iniBytes((string) ini_get('post_max_size'));
            if ($length > App::MAX_UPLOAD_BYTES + 1024 * 1024 || ($hostLimit > 0 && $length > $hostLimit)) {
                throw new ApiError(413, 'Загрузка превышает лимит запроса. Загрузите меньше файлов или увеличьте post_max_size на хостинге.', 'upload_limit');
            }
            return $app->upload($_FILES['photos'] ?? []);
        })(),
    };
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    echo json_encode(['ok' => true] + $result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
} catch (ApiError $error) {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    http_response_code($error->status);
    if ($error->retryAfter !== null) header('Retry-After: ' . $error->retryAfter);
    echo json_encode(['ok' => false, 'error' => $error->getMessage(), 'code' => $error->errorCode], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    error_log('to Dublin admin internal failure: ' . get_class($error));
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Сервис временно недоступен. Проверьте настройки хостинга.', 'code' => 'internal_error'], JSON_UNESCAPED_UNICODE);
}
