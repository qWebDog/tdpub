(() => {
      'use strict';
      const root = document.getElementById('td-configurator-request');
      if (!root) return;
      const get = id => root.querySelector('#' + id);
      const ui = {
        configure:get('td-configure'), configureLabel:get('td-configure-label'),
        builder:get('td-builder-panel'), selectedSummary:get('td-selected-summary'),
        generatorButton:get('td-generator-remove'), generatorHelp:get('td-generator-help'),
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
      const MAX_EXTRA_KEGS = Math.floor((Number.MAX_SAFE_INTEGER - 390000) / 9000);
      const money = value => new Intl.NumberFormat('ru-RU', {maximumFractionDigits:0}).format(value) + ' ₽';
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
          extraKegs:integer(raw.extraKegs,0,0,MAX_EXTRA_KEGS),
          multiday:raw.multiday === true
        };
      }
      function calculate(raw) {
        const s = normalize(raw);
        return s.multiday ? null : 150000 - (s.generator ? 0 : 20000) - (7-s.barrels)*5000 + s.extraHours*15000 + s.extraKegs*9000;
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
        kegs:{min:1,max:MAX_EXTRA_KEGS+1,error:'Введите целое число кегов — не меньше 1.'},
        hours:{min:0,max:16,error:'Введите целое число от 0 до 16. Для более длительного события выберите «Несколько дней».'}
      };
      Object.keys(specs).forEach(key => {
        fields[key] = {
          ...specs[key], input:ui[key],
          minus:get('td-' + key + '-minus'), plus:get('td-' + key + '-plus'),
          errorNode:get('td-' + key + '-error')
        };
      });
      ui.kegs.max = String(MAX_EXTRA_KEGS+1);
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
        ui.singleDay.setAttribute('aria-pressed', String(!state.multiday));
        ui.multiDay.setAttribute('aria-pressed', String(state.multiday));
        ui.hoursField.classList.toggle('is-disabled', state.multiday);
        ui.generatorButton.textContent = state.generator ? 'Не нужен' : 'Вернуть';
        ui.generatorButton.setAttribute('aria-pressed', String(!state.generator));
        ui.generatorButton.setAttribute('aria-label', state.generator ? 'Убрать генератор из комплекта' : 'Вернуть генератор в комплект');
        ui.generatorHelp.textContent = state.generator ? 'Без него: −20 000 ₽' : 'Убран · −20 000 ₽';
        ui.generatorValue.textContent = state.generator ? 'Генератор в комплекте' : 'Генератор убран: −20 000 ₽';
        ui.barrelValue.textContent = errors.barrels ? '—' : state.barrels === 7 ? 'Все 7 включены' : '−' + money((7-state.barrels)*5000);
        ui.kegValue.textContent = errors.kegs ? '—' : state.extraKegs === 0 ? '1 кег включён' : '+' + money(state.extraKegs*9000);
        ui.hourValue.textContent = state.multiday ? 'По согласованию' : errors.hours ? '—' : state.extraHours === 0 ? 'Без продления' : '+' + money(state.extraHours*15000);
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
        ui.barrelSaving.textContent = '−' + money((7-state.barrels)*5000);
        ui.extensionLabel.textContent = 'Продление: ' + hourLabel(state.extraHours);
        ui.hourCharge.textContent = '+' + money(state.extraHours*15000);
        ui.kegLabel.textContent = 'Дополнительные кеги: ' + state.extraKegs;
        ui.kegCharge.textContent = '+' + money(state.extraKegs*9000);
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
      render(true);
    })();
