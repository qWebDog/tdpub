<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    header('Cache-Control: no-store');
    exit;
}

require_once __DIR__ . '/lib.php';

/** Read from stdin only. Never accept or print a password in process arguments. */
function readPassword(string $prompt): string
{
    fwrite(STDERR, $prompt);
    $tty = function_exists('stream_isatty') && stream_isatty(STDIN);
    $state = '';
    if ($tty) {
        if (!function_exists('shell_exec')) throw new RuntimeException('Безопасный ввод недоступен. Передайте две строки пароля через закрытый stdin.');
        $state = trim((string) shell_exec('stty -g 2>/dev/null'));
        if (!preg_match('/^[a-fA-F0-9:; -]+$/D', $state)) throw new RuntimeException('Не удалось отключить отображение пароля.');
        shell_exec('stty -echo 2>/dev/null');
    }
    try {
        $value = fgets(STDIN, 1024);
        if ($value === false) throw new RuntimeException('Не удалось прочитать пароль из stdin.');
        return preg_replace('/\r?\n$/', '', $value) ?? '';
    } finally {
        if ($tty && $state !== '') { shell_exec('stty ' . escapeshellarg($state) . ' 2>/dev/null'); fwrite(STDERR, "\n"); }
    }
}

try {
    $command = $argv[1] ?? 'help';
    if (count($argv) > 2) throw new RuntimeException('Пароль нельзя передавать аргументом команды. Используйте ввод через stdin.');
    if ($command === 'help' || $command === '--help' || $command === '-h') {
        fwrite(STDOUT, "Настройка админки to Dublin\n\nphp admin/manage.php set-password\nphp admin/manage.php status\n\nНеобязательный TO_DUBLIN_PRIVATE_DIR задаёт абсолютный приватный каталог вне webroot.\n");
        exit(0);
    }
    if (!in_array($command, ['set-password', 'status'], true)) throw new RuntimeException('Неизвестная команда. Используйте --help.');
    $app = new ToDublinAdmin\App();
    if ($command === 'status') {
        fwrite(STDOUT, $app->credentials() === null ? "Пароль ещё не настроен.\n" : "Пароль настроен.\n");
        exit(0);
    }
    $first = readPassword('Новый пароль (12–72 байта): ');
    $second = readPassword('Повторите пароль: ');
    if (!hash_equals($first, $second)) throw new RuntimeException('Пароли не совпадают. Изменения не сохранены.');
    $app->setPassword($first);
    unset($first, $second);
    fwrite(STDOUT, "Пароль сохранён в приватном каталоге. Старые сессии будут завершены.\n");
} catch (Throwable $error) {
    fwrite(STDERR, 'Ошибка: ' . $error->getMessage() . "\n");
    exit(1);
}
