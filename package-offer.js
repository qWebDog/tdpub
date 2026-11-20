(() => {
      'use strict';
      const root = document.getElementById('td-configurator-request');
      if (!root) return;
      const get = id => root.querySelector('#' + id);
      const ui = {
        configure:get('td-configure'), configureLabel:get('td-configure-label'),
        builder:get('td-builder-panel'), selectedSummary:get('td-selected-summary'),
        generatorButton:get('td-generator-remove'), generatorHelp:get('td-generator-help'),
        barrelsHelp:get('td-barrels-help'), kegsHelp:get('td-kegs-help'), hoursHelp:get('td-hours-help'),
        barrels:get('td-barrels'), hours:get('td-hours'), kegs:get('td-kegs'),
        singleDay:get('td-single-day'), multiDay:get('td-multi-day'),
        barrelValue:get('td-barrels-value'), hourValue:get('td-hours-value'), hoursField:get('td-hours-field'),
        generatorValue:get('td-generator-value'), kegValue:get('td-kegs-value'),
        total:get('td-total'), duration:get('td-duration'), breakdown:get('td-breakdown'),
        generatorRow:get('td-generator-row'), barrelRow:get('td-barrels-row'), hourRow:get('td-hours-row'), kegRow:get('td-kegs-row'),
        removedLabel:get('td-removed-label'), barrelSaving:get('td-barrels-saving'), extensionLabel:get('td-extension-label'), hourCharge:get('td-hours-charge'),
        kegLabel:get('td-kegs-label'), kegCharge:get('td-kegs-charge'), heading:get('td-package-heading'), baseLabel:get('td-base-label'),
        baseRequest:get('td-request-base')
      };
      const PACKAGE_NAME = 'Мероприятие';
      const DEFAULT_PRICING = Object.freeze({base:150000,generatorDiscount:20000,barrelDiscount:5000,extraHour:15000,extraKeg:9000});
      function validPricing(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const result = {};
        for (const key of Object.keys(DEFAULT_PRICING)) {
          const value = raw[key];
          if (!Number.isSafeInteger(value) || value < 0 || value > 100000000) return null;
          result[key] = value;
        }
        if (result.extraKeg < 1 || result.base < result.generatorDiscount + 7 * result.barrelDiscount) return null;
        return result;
      }
      let pricing = validPricing(window.ToDublinContent?.current?.pricing) || DEFAULT_PRICING;
      function safeExtraKegLimit() {
        // Reserve the largest single-day base/extension total before allowing extra kegs.
        // One included keg must also fit in the safe-integer input count.
        const reserve = pricing.base + 16 * pricing.extraHour;
        return Math.min(Number.MAX_SAFE_INTEGER - 1, Math.floor((Number.MAX_SAFE_INTEGER - reserve) / pricing.extraKeg));
      }
      let maxExtraKegs = safeExtraKegLimit();
      const money = value => new Intl.NumberFormat('ru-RU', {maximumFractionDigits:0}).format(value) + ' ₽';
      function optionalText(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
      }
      function parseInteger(value) {
        if (typeof value === 'string') {
          value = value.trim();
          if (!/^[+-]?\d+$/.test(value)) return null;
        } else if (typeof value !== 'number') return null;
        const n = Number(value);
        return Number.isSafeInteger(n) ? n : null;
      }
      function integer(value, fallback, minimum, maximum) {
        const n = parseInteger(value);
        return n === null ? fallback : Math.min(maximum, Math.max(minimum, n));
      }
      function normalize(raw = {}) {
        if (!raw || typeof raw !== 'object') raw = {};
        return {
          packageName:PACKAGE_NAME,
          generator:raw.generator !== false,
          barrels:integer(raw.barrels,7,0,7),
          extraHours:integer(raw.extraHours,0,0,16),
          extraKegs:integer(raw.extraKegs,0,0,maxExtraKegs),
          multiday:raw.multiday === true
        };
      }
      function calculate(raw) {
        const s = normalize(raw);
        return s.multiday ? null : pricing.base - (s.generator ? 0 : pricing.generatorDiscount) - (7-s.barrels)*pricing.barrelDiscount + s.extraHours*pricing.extraHour + s.extraKegs*pricing.extraKeg;
      }
      function countLabel(count, one, few, many) {
        const rem = count % 100;
        const word = rem >= 11 && rem <= 14 ? many : count % 10 === 1 ? one : count % 10 >= 2 && count % 10 <= 4 ? few : many;
        return count + ' ' + word;
      }
      function hourLabel(count) {
        return countLabel(count, 'час', 'часа', 'часов');
      }
      let state = normalize();
      let builderExpanded = false;
      const errors = {};
      const fields = {};
      const specs = {
        barrels:{min:0,max:7,error:'Введите целое число от 0 до 7.'},
        kegs:{min:1,max:maxExtraKegs+1,error:''},
        hours:{min:0,max:16,error:'Введите целое число от 0 до 16. Для более длительного события выберите «Несколько дней».'}
      };
      Object.keys(specs).forEach(key => {
        fields[key] = {
          ...specs[key], input:ui[key],
          minus:get('td-' + key + '-minus'), plus:get('td-' + key + '-plus'),
          errorNode:get('td-' + key + '-error')
        };
      });
      function updateKegLimit() {
        maxExtraKegs = safeExtraKegLimit();
        fields.kegs.max = maxExtraKegs + 1;
        fields.kegs.error = 'Введите целое число кегов от 1 до ' + new Intl.NumberFormat('ru-RU').format(fields.kegs.max) + '.';
        ui.kegs.max = String(fields.kegs.max);
      }
      updateKegLimit();
      const hasErrors = () => Object.values(errors).some(Boolean);
      function fieldValue(key) {
        return key === 'hours' ? state.extraHours : key === 'kegs' ? state.extraKegs+1 : state.barrels;
      }
      function assignField(key, value) {
        if (key === 'hours') state.extraHours = value;
        else if (key === 'kegs') state.extraKegs = value-1;
        else state.barrels = value;
      }
      function readField(key) {
        const f = fields[key];
        const n = parseInteger(f.input.value);
        return n !== null && n >= f.min && n <= f.max ? n : null;
      }
      function render(syncInputs = false) {
        Object.keys(fields).forEach(key => {
          const f = fields[key];
          if (syncInputs) { f.input.value = String(fieldValue(key)); delete errors[key]; }
          const invalid = Boolean(errors[key]);
          const disabled = key === 'hours' && state.multiday;
          const current = readField(key);
          f.input.disabled = disabled;
          f.input.setAttribute('aria-invalid', String(invalid));
          f.errorNode.textContent = invalid ? f.error : '';
          f.errorNode.hidden = !invalid;
          f.minus.disabled = disabled || (current !== null && current <= f.min);
          f.plus.disabled = disabled || (current !== null && current >= f.max);
        });
        const invalid = hasErrors();
        const price = calculate(state);
        ui.heading.textContent = state.packageName;
        ui.baseLabel.textContent = 'Базовые 8 часов';
        optionalText('td-base-price-value', money(pricing.base));
        optionalText('td-base-breakdown-value', money(pricing.base));
        optionalText('td-generator-discount-value', '−' + money(pricing.generatorDiscount));
        optionalText('td-faq-base-price', money(pricing.base));
        optionalText('td-faq-extra-hour-price', money(pricing.extraHour));
        ui.barrelsHelp.textContent = '−' + money(pricing.barrelDiscount) + ' за каждый убранный стол';
        ui.kegsHelp.textContent = 'Первый включён · +' + money(pricing.extraKeg) + ' за дополнительный';
        ui.hoursHelp.textContent = '+' + money(pricing.extraHour) + ' за час';
        ui.singleDay.setAttribute('aria-pressed', String(!state.multiday));
        ui.multiDay.setAttribute('aria-pressed', String(state.multiday));
        ui.hoursField.classList.toggle('is-disabled', state.multiday);
        ui.generatorButton.textContent = state.generator ? 'Не нужен' : 'Вернуть';
        ui.generatorButton.setAttribute('aria-pressed', String(!state.generator));
        ui.generatorButton.setAttribute('aria-label', state.generator ? 'Убрать генератор из комплекта' : 'Вернуть генератор в комплект');
        ui.generatorHelp.textContent = (state.generator ? 'Без него: −' : 'Убран · −') + money(pricing.generatorDiscount);
        ui.generatorValue.textContent = state.generator ? 'Генератор в комплекте' : 'Генератор убран: −' + money(pricing.generatorDiscount);
        ui.barrelValue.textContent = errors.barrels ? '—' : state.barrels === 7 ? 'Все 7 включены' : '−' + money((7-state.barrels)*pricing.barrelDiscount);
        ui.kegValue.textContent = errors.kegs ? '—' : state.extraKegs === 0 ? '1 кег включён' : '+' + money(state.extraKegs*pricing.extraKeg);
        ui.hourValue.textContent = state.multiday ? 'По согласованию' : errors.hours ? '—' : state.extraHours === 0 ? 'Без продления' : '+' + money(state.extraHours*pricing.extraHour);
        ui.total.textContent = invalid ? 'Проверьте значения' : price === null ? 'По согласованию' : money(price);
        ui.total.classList.toggle('is-negotiated', invalid || price === null);
        ui.duration.textContent = invalid ? 'Исправьте выделенные поля.' : state.multiday ? 'На несколько дней' : 'Всего ' + hourLabel(8+state.extraHours);
        const hasAdjustments = !state.generator || state.barrels !== 7 || state.extraHours !== 0 || state.extraKegs !== 0;
        ui.builder.hidden = !builderExpanded;
        ui.configure.setAttribute('aria-expanded', String(builderExpanded));
        ui.configureLabel.textContent = builderExpanded ? 'Свернуть настройки' : 'Настроить';
        ui.selectedSummary.hidden = builderExpanded || (!hasAdjustments && !state.multiday && !invalid);
        ui.selectedSummary.textContent = invalid ? 'Проверьте поля в настройках.' : state.multiday ? 'Ваш расчёт: по согласованию · несколько дней' : 'Ваш расчёт: ' + money(price) + ' · ' + hourLabel(8+state.extraHours);
        ui.breakdown.hidden = invalid || state.multiday || !hasAdjustments;
        ui.generatorRow.hidden = state.generator;
        ui.barrelRow.hidden = state.barrels === 7;
        ui.hourRow.hidden = state.extraHours === 0;
        ui.kegRow.hidden = state.extraKegs === 0;
        ui.removedLabel.textContent = 'Убрано столов-бочек: ' + (7-state.barrels);
        ui.barrelSaving.textContent = '−' + money((7-state.barrels)*pricing.barrelDiscount);
        ui.extensionLabel.textContent = 'Продление: ' + hourLabel(state.extraHours);
        ui.hourCharge.textContent = '+' + money(state.extraHours*pricing.extraHour);
        ui.kegLabel.textContent = 'Дополнительные кеги: ' + state.extraKegs;
        ui.kegCharge.textContent = '+' + money(state.extraKegs*pricing.extraKeg);
        ui.baseRequest.hidden = builderExpanded;
      }
      function changed() {
        render();
      }
      ui.configure.addEventListener('click', () => {
        builderExpanded = !builderExpanded;
        render();
      });
      ui.generatorButton.addEventListener('click', () => {
        state.generator = !state.generator;
        changed();
      });
      Object.keys(fields).forEach(key => {
        const f = fields[key];
        f.input.addEventListener('input', () => {
          const value = readField(key);
          errors[key] = value === null;
          if (value !== null) assignField(key, value);
          changed();
        });
        [-1, 1].forEach(delta => {
          const button = delta < 0 ? f.minus : f.plus;
          button.addEventListener('click', () => {
            if (button.disabled) return;
            const current = readField(key);
            const next = Math.min(f.max, Math.max(f.min, (current === null ? fieldValue(key) : current) + delta));
            assignField(key, next);
            f.input.value = String(next);
            delete errors[key];
            changed();
          });
        });
      });
      function chooseDays(multiday) {
        state.multiday = multiday;
        if (multiday) {
          delete errors.hours;
          ui.hours.value = String(state.extraHours);
        }
        changed();
      }
      ui.singleDay.addEventListener('click', () => chooseDays(false));
      ui.multiDay.addEventListener('click', () => chooseDays(true));
      document.addEventListener('to-dublin:content-ready', event => {
        const next = validPricing(event.detail?.content?.pricing);
        if (!next) return;
        pricing = next;
        updateKegLimit();
        // Keep entered text and unrelated errors. If a new rate reduces the safe
        // keg limit, show an error rather than silently replacing the input.
        const enteredKegs = readField('kegs');
        errors.kegs = enteredKegs === null;
        if (enteredKegs !== null) assignField('kegs', enteredKegs);
        else state.extraKegs = Math.min(state.extraKegs, maxExtraKegs);
        render();
      });
      render(true);
    })();
