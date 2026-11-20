<?php
declare(strict_types=1);
require_once __DIR__ . '/lib.php';
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'");
try { ToDublinAdmin\requireSecureTransport(); }
catch (ToDublinAdmin\ApiError $error) {
    http_response_code($error->status);
    echo 'Откройте админку по HTTPS.';
    exit;
}
?>
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="referrer" content="same-origin">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'">
  <title>Управление сайтом — to Dublin</title>
  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="admin.css?v=1">
  <script src="admin.js?v=1" defer></script>
</head>
<body>
  <header class="admin-header">
    <a class="admin-brand" href="../index.html" target="_blank" rel="noopener noreferrer">to Dublin<span>управление сайтом</span></a>
    <div class="header-actions">
      <a class="button button-quiet" href="../index.html" target="_blank" rel="noopener noreferrer">Открыть сайт</a>
      <button class="button button-quiet" id="logoutButton" type="button" hidden>Выйти</button>
    </div>
  </header>
  <main class="admin-main" id="adminMain">
    <div class="page-heading">
      <p class="eyebrow">Всё под вашим контролем</p>
      <h1>Фотографии и стоимость</h1>
      <p>Выберите кадры для галереи и обновите цены мероприятия.</p>
    </div>
    <noscript><p class="notice notice-error">Для работы админки включите JavaScript в браузере.</p></noscript>
    <section class="access-panel" id="connectionPanel" aria-labelledby="connectionTitle">
      <p class="eyebrow">Подключение</p>
      <h2 id="connectionTitle">Проверяем доступ</h2>
      <p id="connectionText">Соединяемся с настройками сайта…</p>
      <div class="access-actions">
        <button class="button button-primary" id="retryButton" type="button" hidden>Повторить проверку</button>
        <a class="button button-secondary" id="setupHelp" href="README.md" target="_blank" rel="noopener noreferrer" hidden>Инструкция настройки</a>
      </div>
    </section>
    <section class="access-panel login-panel" id="loginPanel" aria-labelledby="loginTitle" hidden>
      <p class="eyebrow">Для владельца сайта</p>
      <h2 id="loginTitle">Вход в админку</h2>
      <p>Введите пароль, который вы установили при настройке хостинга.</p>
      <form id="loginForm" action="api.php?action=login" method="post">
        <label class="field-label" for="adminPassword">Пароль</label>
        <input id="adminPassword" name="password" type="password" autocomplete="current-password" required>
        <button class="button button-primary" id="loginButton" type="submit">Войти</button>
      </form>
    </section>
    <p class="notice" id="globalStatus" role="status" aria-live="polite" hidden></p>
    <form id="contentForm" action="api.php?action=save" method="post" hidden novalidate>
      <fieldset class="workspace-fields" id="workspaceFields">
        <legend class="visually-hidden">Настройки галереи и цен</legend>
        <nav class="admin-tabs" role="tablist" aria-label="Настройки сайта">
          <button class="admin-tab is-active" id="photosTab" type="button" role="tab" aria-selected="true" aria-controls="photosPanel">Фотографии <span id="tabPhotoCount">0</span></button>
          <button class="admin-tab" id="pricesTab" type="button" role="tab" aria-selected="false" aria-controls="pricesPanel" tabindex="-1">Цены</button>
        </nav>
        <section id="photosPanel" role="tabpanel" aria-labelledby="photosTab">
          <div class="section-heading">
            <div><h2>Галерея</h2><p>Первые три фотографии составят коллаж. Остальные откроются при перелистывании.</p></div>
          </div>
          <div class="upload-panel">
            <div><h3>Добавить новые кадры</h3><p>JPG, PNG или WebP. До 10 файлов за раз: не больше 10 МБ каждый и 40 МБ суммарно.</p></div>
            <button class="button button-secondary" id="uploadButton" type="button">Загрузить фотографии</button>
            <input id="photoUpload" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
            <p class="upload-note">Загрузка добавляет файлы в папку. Для показа на сайте выберите их ниже и сохраните изменения.</p>
          </div>
          <p class="notice" id="uploadStatus" role="status" aria-live="polite" hidden></p>
          <div class="list-heading"><h3>Порядок в галерее</h3><p id="selectedCount">Не выбрано ни одной фотографии</p></div>
          <p class="empty-state" id="selectedEmpty">Отметьте снимки в папке ниже. Если список останется пустым, галерея на сайте будет скрыта.</p>
          <ol class="selected-list" id="selectedList" aria-label="Выбранные фотографии по порядку"></ol>
          <p class="visually-hidden" id="galleryStatus" role="status" aria-live="polite"></p>
          <div class="list-heading inventory-heading"><h3>Фотографии в папке</h3><p id="inventoryCount">0 файлов</p></div>
          <p class="empty-state" id="inventoryEmpty">В папке пока нет фотографий. Загрузите первые кадры кнопкой выше или добавьте их через файловый менеджер хостинга.</p>
          <div class="photo-inventory" id="photoInventory"></div>
        </section>
        <section id="pricesPanel" role="tabpanel" aria-labelledby="pricesTab" hidden>
          <div class="section-heading"><div><h2>Стоимость мероприятия</h2><p>Базовый комплект: 8 часов, фургон, генератор, 7 столов-бочек, 1 кег, бармен, освещение и доставка.</p></div></div>
          <div class="pricing-panel">
            <label class="price-field price-field-base" for="priceBase"><span class="field-label">Базовая стоимость за 8 часов</span><span class="money-input"><input id="priceBase" data-price="base" type="number" inputmode="numeric" min="0" max="100000000" step="1" required aria-describedby="priceBaseHelp priceBaseError"><span aria-hidden="true">₽</span></span><span class="field-help" id="priceBaseHelp">Основная цена, от которой рассчитываются все изменения.</span><span class="field-error" id="priceBaseError" hidden></span></label>
            <div class="price-adjustments">
              <label class="price-field" for="priceGenerator"><span class="field-label">Без генератора</span><span class="money-input"><input id="priceGenerator" data-price="generatorDiscount" type="number" inputmode="numeric" min="0" max="100000000" step="1" required aria-describedby="priceGeneratorHelp priceGeneratorError"><span aria-hidden="true">₽</span></span><span class="field-help" id="priceGeneratorHelp">На сколько уменьшается цена, если генератор не нужен.</span><span class="field-error" id="priceGeneratorError" hidden></span></label>
              <label class="price-field" for="priceBarrel"><span class="field-label">Без одного стола-бочки</span><span class="money-input"><input id="priceBarrel" data-price="barrelDiscount" type="number" inputmode="numeric" min="0" max="100000000" step="1" required aria-describedby="priceBarrelHelp priceBarrelError"><span aria-hidden="true">₽</span></span><span class="field-help" id="priceBarrelHelp">Уменьшение цены за каждый убранный стол из семи.</span><span class="field-error" id="priceBarrelError" hidden></span></label>
              <label class="price-field" for="priceHour"><span class="field-label">Дополнительный час</span><span class="money-input"><input id="priceHour" data-price="extraHour" type="number" inputmode="numeric" min="0" max="100000000" step="1" required aria-describedby="priceHourHelp priceHourError"><span aria-hidden="true">₽</span></span><span class="field-help" id="priceHourHelp">Стоимость каждого часа после базовых восьми.</span><span class="field-error" id="priceHourError" hidden></span></label>
              <label class="price-field" for="priceKeg"><span class="field-label">Дополнительный кег</span><span class="money-input"><input id="priceKeg" data-price="extraKeg" type="number" inputmode="numeric" min="1" max="100000000" step="1" required aria-describedby="priceKegHelp priceKegError"><span aria-hidden="true">₽</span></span><span class="field-help" id="priceKegHelp">Цена за один кег сверх первого, включённого в комплект.</span><span class="field-error" id="priceKegError" hidden></span></label>
            </div>
            <div class="price-check"><span>Минимальная стоимость за 8 часов<span class="field-help">Без генератора и всех семи столов-бочек</span></span><output id="minimumPrice">—</output></div>
          </div>
          <p class="field-help pricing-footnote">Цены указываются целыми рублями. Стоимость многодневных мероприятий согласуется отдельно.</p>
        </section>
        <div class="save-bar">
          <div><strong id="dirtyLabel">Изменений нет</strong><p id="saveHint">Настройки сохраняются для всего сайта.</p></div>
          <div class="save-actions"><button class="button button-quiet" id="reloadButton" type="button" hidden>Загрузить актуальную версию</button><button class="button button-primary" id="saveButton" type="submit" disabled>Сохранить изменения</button></div>
        </div>
      </fieldset>
    </form>
  </main>
  <footer class="admin-footer">to Dublin <span>Фотографии, которые вы выбрали. Цены, которые вы задали.</span></footer>
</body>
</html>
