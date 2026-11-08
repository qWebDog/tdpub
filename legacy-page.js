(() => {
  'use strict';
  const target = new URL('index.html', location.href);
  target.search = location.search;
  target.hash = location.hash && location.hash !== '#serviceMain' ? location.hash : '#overview';
  location.replace(target.href);
})();
