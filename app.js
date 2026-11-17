'use strict';

/* ==========================================================================
   Budget Tracker — логика приложения
   Классы:
     Storage    — работа с LocalStorage (загрузка, сохранение, удаление);
     UI         — отрисовка интерфейса и обновление DOM;
     BudgetApp  — бизнес-логика, связывание Storage и UI, обработка событий.
   ========================================================================== */

/* ---------- Константы ---------- */

/** Ключи LocalStorage (строго по техническому заданию). */
const STORAGE_KEYS = Object.freeze({
  transactions: 'budget_transactions',
  categories: 'budget_categories',
  wallets: 'budget_wallets',
});

/** Стандартные категории, которые загружаются при первом запуске. */
const DEFAULT_CATEGORIES = Object.freeze({
  income: Object.freeze(['Зарплата', 'Подработка', 'Подарки']),
  expense: Object.freeze([
    'Еда',
    'Транспорт',
    'Жилье/Коммуналка',
    'Развлечения',
    'Здоровье',
    'Прочее',
  ]),
});

/** Стандартные кошельки, которые загружаются при первом запуске. */
const DEFAULT_WALLETS = Object.freeze(['Наличные', 'Банковская карта']);

/* ---------- Вспомогательные функции ---------- */

/**
 * Возвращает сегодняшнюю дату в формате YYYY-MM-DD (локальный часовой пояс).
 * @returns {string}
 */
function todayISO() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Преобразует введённую строку в число. Поддерживает запятую как разделитель.
 * @param {string} value
 * @returns {number}
 */
function parseAmount(value) {
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  return Number(normalized);
}

/**
 * Форматирует сумму в рублях: 45 230,50 ₽.
 * @param {number} value
 * @returns {string}
 */
function formatMoney(value) {
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  // Для отрицательных сумм используем типографский минус, как в списке транзакций.
  return `${formatted.replace(/^-/, '−')}\u00A0₽`;
}

/**
 * Форматирует сумму со знаком для списка транзакций.
 * @param {{type: string, amount: number}} transaction
 * @returns {string}
 */
function formatSignedAmount(transaction) {
  const sign = transaction.type === 'income' ? '+' : '−';
  return `${sign}${formatMoney(transaction.amount)}`;
}

/**
 * Форматирует дату из YYYY-MM-DD в DD.MM.YYYY.
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

/**
 * Генерирует уникальный идентификатор транзакции.
 * @returns {string}
 */
function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `tx-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Убирает лишние пробелы в названии категории/кошелька.
 * @param {string} value
 * @returns {string}
 */
function normalizeName(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

/**
 * Проверяет, что запись из LocalStorage похожа на транзакцию.
 * @param {unknown} transaction
 * @returns {boolean}
 */
function isValidTransaction(transaction) {
  if (!transaction || typeof transaction !== 'object') return false;
  const amount = Number(transaction.amount);
  return (
    typeof transaction.id === 'string' &&
    (transaction.type === 'income' || transaction.type === 'expense') &&
    Number.isFinite(amount) &&
    amount > 0 &&
    typeof transaction.category === 'string' &&
    transaction.category.trim() !== '' &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(transaction.date)) &&
    typeof transaction.wallet === 'string' &&
    transaction.wallet.trim() !== ''
  );
}

/**
 * Очищает список строк: убирает пустые значения и дубликаты.
 * @param {unknown} list
 * @returns {string[]}
 */
function sanitizeNameList(list) {
  if (!Array.isArray(list)) return [];
  const result = [];
  list.forEach((item) => {
    if (typeof item !== 'string') return;
    const name = normalizeName(item);
    if (name && !result.includes(name)) result.push(name);
  });
  return result;
}

/* ==========================================================================
   class Storage — работа с LocalStorage
   ========================================================================== */

class Storage {
  /**
   * @param {globalThis.Storage} [storage] — по умолчанию window.localStorage.
   */
  constructor(storage = window.localStorage) {
    this.storage = storage;
  }

  /**
   * Загружает и парсит значение по ключу.
   * @param {string} key
   * @param {*} [fallback] — значение при отсутствии или ошибке.
   * @returns {*}
   */
  load(key, fallback = null) {
    try {
      const raw = this.storage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      console.warn(`[Storage] Не удалось прочитать ключ «${key}»:`, error);
      return fallback;
    }
  }

  /**
   * Сохраняет значение в LocalStorage.
   * @param {string} key
   * @param {*} value
   * @returns {boolean} — true, если сохранение прошло успешно.
   */
  save(key, value) {
    try {
      this.storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`[Storage] Не удалось сохранить ключ «${key}»:`, error);
      window.alert('Не удалось сохранить данные. Проверьте настройки браузера (LocalStorage).');
      return false;
    }
  }

  /**
   * Удаляет значение по ключу.
   * @param {string} key
   * @returns {boolean}
   */
  remove(key) {
    try {
      this.storage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`[Storage] Не удалось удалить ключ «${key}»:`, error);
      return false;
    }
  }

  /**
   * Создаёт копию стандартных категорий.
   * @returns {{income: string[], expense: string[]}}
   */
  createDefaultCategories() {
    return {
      income: [...DEFAULT_CATEGORIES.income],
      expense: [...DEFAULT_CATEGORIES.expense],
    };
  }

  /**
   * Записывает стандартные категории и кошельки при первом запуске
   * (или если данные в LocalStorage повреждены).
   */
  initializeDefaults() {
    const categories = this.load(STORAGE_KEYS.categories, null);
    if (
      !categories ||
      typeof categories !== 'object' ||
      !Array.isArray(categories.income) ||
      !Array.isArray(categories.expense)
    ) {
      this.saveCategories(this.createDefaultCategories());
    }

    const wallets = this.load(STORAGE_KEYS.wallets, null);
    if (!Array.isArray(wallets)) {
      this.saveWallets([...DEFAULT_WALLETS]);
    }
  }

  /**
   * Загружает транзакции. Некорректные записи отбрасываются.
   * @returns {Array<object>}
   */
  getTransactions() {
    const data = this.load(STORAGE_KEYS.transactions, []);
    if (!Array.isArray(data)) return [];

    return data.filter(isValidTransaction).map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: Number(transaction.amount),
      category: transaction.category,
      date: transaction.date,
      comment: typeof transaction.comment === 'string' ? transaction.comment : '',
      wallet: transaction.wallet,
    }));
  }

  /**
   * Сохраняет массив транзакций.
   * @param {Array<object>} transactions
   * @returns {boolean}
   */
  saveTransactions(transactions) {
    return this.save(STORAGE_KEYS.transactions, transactions);
  }

  /**
   * Загружает категории. Если данных нет — возвращает стандартные.
   * @returns {{income: string[], expense: string[]}}
   */
  getCategories() {
    const data = this.load(STORAGE_KEYS.categories, null);
    const fallback = this.createDefaultCategories();

    if (!data || typeof data !== 'object') return fallback;

    const income = sanitizeNameList(data.income);
    const expense = sanitizeNameList(data.expense);

    return {
      income: income.length > 0 ? income : fallback.income,
      expense: expense.length > 0 ? expense : fallback.expense,
    };
  }

  /**
   * Сохраняет категории.
   * @param {{income: string[], expense: string[]}} categories
   * @returns {boolean}
   */
  saveCategories(categories) {
    return this.save(STORAGE_KEYS.categories, {
      income: [...categories.income],
      expense: [...categories.expense],
    });
  }

  /**
   * Загружает кошельки. Если данных нет — возвращает стандартные.
   * @returns {string[]}
   */
  getWallets() {
    const data = this.load(STORAGE_KEYS.wallets, null);
    const wallets = sanitizeNameList(data);
    return wallets.length > 0 ? wallets : [...DEFAULT_WALLETS];
  }

  /**
   * Сохраняет кошельки.
   * @param {string[]} wallets
   * @returns {boolean}
   */
  saveWallets(wallets) {
    return this.save(STORAGE_KEYS.wallets, [...wallets]);
  }
}

/* ==========================================================================
   class UI — отрисовка интерфейса и обновление DOM
   ========================================================================== */

class UI {
  constructor() {
    /** Кэш DOM-элементов, чтобы не искать их при каждой отрисовке. */
    this.el = {
      form: document.getElementById('transaction-form'),
      type: document.getElementById('type'),
      amount: document.getElementById('amount'),
      category: document.getElementById('category'),
      wallet: document.getElementById('wallet'),
      date: document.getElementById('date'),
      comment: document.getElementById('comment'),

      balanceCard: document.getElementById('balance-card'),
      balance: document.getElementById('balance'),
      totalIncome: document.getElementById('total-income'),
      totalExpense: document.getElementById('total-expense'),

      transactionsList: document.getElementById('transactions-list'),
      transactionsCount: document.getElementById('transactions-count'),
      emptyState: document.getElementById('empty-state'),
      transactionTemplate: document.getElementById('transaction-template'),

      openSettings: document.getElementById('open-settings'),
      settingsDialog: document.getElementById('settings-dialog'),
      closeSettings: document.getElementById('close-settings'),
      doneSettings: document.getElementById('done-settings'),
      incomeCategoriesList: document.getElementById('income-categories-list'),
      expenseCategoriesList: document.getElementById('expense-categories-list'),
      walletsList: document.getElementById('wallets-list'),
      addCategoryForms: Array.from(document.querySelectorAll('[data-add-category]')),
      addWalletForm: document.querySelector('[data-add-wallet]'),

      toast: document.getElementById('toast'),
    };

    this.toastTimer = null;
  }

  /** Начальная настройка полей формы. */
  init() {
    this.el.date.value = todayISO();
  }

  /**
   * Считывает значения формы.
   * @returns {{type: string, amount: string, category: string, wallet: string, date: string, comment: string}}
   */
  getFormData() {
    return {
      type: this.el.type.value,
      amount: this.el.amount.value,
      category: this.el.category.value,
      wallet: this.el.wallet.value,
      date: this.el.date.value,
      comment: this.el.comment.value.trim(),
    };
  }

  /** Очищает форму и возвращает дату на сегодня. */
  resetForm() {
    this.el.form.reset();

    // Выпадающие списки заполняются динамически, поэтому после reset()
    // браузер может выбрать первый доступный вариант — сбрасываем явно.
    this.el.category.value = '';
    this.el.wallet.value = '';
    this.el.date.value = todayISO();
  }

  /**
   * Заполняет выпадающий список категорий для выбранного типа.
   * @param {string} type — 'income' | 'expense'
   * @param {string[]} categories
   * @param {string} [selected]
   */
  setCategoryOptions(type, categories, selected = '') {
    const placeholder = new Option('Выберите категорию', '');
    placeholder.disabled = true;

    const options = categories.map((category) => new Option(category, category));
    this.el.category.replaceChildren(placeholder, ...options);

    const hasSelected = selected !== '' && categories.includes(selected);
    this.el.category.value = hasSelected ? selected : '';
    this.el.category.dataset.type = type;
  }

  /**
   * Заполняет выпадающий список кошельков.
   * @param {string[]} wallets
   * @param {string} [selected]
   */
  setWalletOptions(wallets, selected = '') {
    const placeholder = new Option('Выберите кошелёк', '');
    placeholder.disabled = true;

    const options = wallets.map((wallet) => new Option(wallet, wallet));
    this.el.wallet.replaceChildren(placeholder, ...options);

    const hasSelected = selected !== '' && wallets.includes(selected);
    this.el.wallet.value = hasSelected ? selected : '';
  }

  /**
   * Обновляет карточку баланса и итоги.
   * @param {number} income
   * @param {number} expense
   */
  renderBalance(income, expense) {
    const balance = Math.round((income - expense) * 100) / 100;

    this.el.balance.textContent = formatMoney(balance);
    this.el.totalIncome.textContent = formatMoney(income);
    this.el.totalExpense.textContent = formatMoney(expense);
    this.el.balanceCard.classList.toggle('is-negative', balance < 0);
  }

  /**
   * Отрисовывает список транзакций.
   * @param {Array<object>} transactions — уже отсортированные и ограниченные записи.
   */
  renderTransactions(transactions) {
    const hasTransactions = transactions.length > 0;

    this.el.transactionsList.hidden = !hasTransactions;
    this.el.emptyState.hidden = hasTransactions;
    this.el.transactionsList.replaceChildren(
      ...transactions.map((transaction) => this.createTransactionRow(transaction))
    );
  }

  /**
   * Создаёт DOM-узел одной транзакции по шаблону.
   * @param {object} transaction
   * @returns {HTMLLIElement}
   */
  createTransactionRow(transaction) {
    const row = this.el.transactionTemplate.content.firstElementChild.cloneNode(true);
    const isIncome = transaction.type === 'income';

    row.classList.add(isIncome ? 'transaction--income' : 'transaction--expense');
    row.dataset.id = transaction.id;

    row.querySelector('.transaction-icon use').setAttribute(
      'href',
      isIncome ? '#icon-arrow-up-right' : '#icon-arrow-down-left'
    );
    row.querySelector('.transaction-category').textContent = transaction.category;
    row.querySelector('.transaction-amount').textContent = formatSignedAmount(transaction);
    row.querySelector('.transaction-meta').textContent =
      `${formatDate(transaction.date)} · ${transaction.wallet}`;
    row.querySelector('.transaction-comment').textContent = transaction.comment;

    const deleteButton = row.querySelector('.transaction-delete');
    deleteButton.dataset.deleteId = transaction.id;
    deleteButton.setAttribute('aria-label', `Удалить транзакцию «${transaction.category}»`);

    return row;
  }

  /**
   * Обновляет счётчик транзакций в заголовке списка.
   * @param {number} shown
   * @param {number} total
   */
  renderTransactionsCount(shown, total) {
    if (total === 0) {
      this.el.transactionsCount.textContent = '0';
    } else if (shown < total) {
      this.el.transactionsCount.textContent = `${shown} из ${total}`;
    } else {
      this.el.transactionsCount.textContent = String(total);
    }
  }

  /**
   * Перерисовывает списки категорий и кошельков в настройках.
   * @param {{income: string[], expense: string[]}} categories
   * @param {string[]} wallets
   */
  renderSettings(categories, wallets) {
    this.el.incomeCategoriesList.replaceChildren(
      ...categories.income.map((name) => this.createCategoryItem('income', name))
    );
    this.el.expenseCategoriesList.replaceChildren(
      ...categories.expense.map((name) => this.createCategoryItem('expense', name))
    );
    this.el.walletsList.replaceChildren(
      ...wallets.map((name) => this.createWalletItem(name))
    );
  }

  /**
   * Создаёт строку категории в настройках.
   * @param {string} type
   * @param {string} name
   * @returns {HTMLLIElement}
   */
  createCategoryItem(type, name) {
    const isDefault = DEFAULT_CATEGORIES[type].includes(name);
    return this.createSettingsItem({
      name,
      isDefault,
      deleteLabel: `Удалить категорию «${name}»`,
      data: { category: name, categoryType: type },
    });
  }

  /**
   * Создаёт строку кошелька в настройках.
   * @param {string} name
   * @returns {HTMLLIElement}
   */
  createWalletItem(name) {
    const isDefault = DEFAULT_WALLETS.includes(name);
    return this.createSettingsItem({
      name,
      isDefault,
      deleteLabel: `Удалить кошелёк «${name}»`,
      data: { wallet: name },
    });
  }

  /**
   * Создаёт строку списка настроек: название + кнопка удаления или бейдж «базовая».
   * @param {{name: string, isDefault: boolean, deleteLabel: string, data: object}} options
   * @returns {HTMLLIElement}
   */
  createSettingsItem({ name, isDefault, deleteLabel, data }) {
    const item = document.createElement('li');
    item.className = 'settings-item';

    const nameElement = document.createElement('span');
    nameElement.className = 'settings-item-name';
    nameElement.textContent = name;
    nameElement.title = name;
    item.appendChild(nameElement);

    if (isDefault) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'базовая';
      badge.title = 'Стандартную запись удалить нельзя';
      item.appendChild(badge);
      return item;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button';
    button.title = deleteLabel;
    button.setAttribute('aria-label', deleteLabel);

    if (data.category !== undefined) {
      button.dataset.category = data.category;
      button.dataset.categoryType = data.categoryType;
    }
    if (data.wallet !== undefined) {
      button.dataset.wallet = data.wallet;
    }

    // Статичная иконка (не пользовательские данные), поэтому innerHTML безопасен.
    button.innerHTML =
      '<svg class="icon" aria-hidden="true"><use href="#icon-trash"></use></svg>';
    item.appendChild(button);

    return item;
  }

  /** Открывает модальное окно настроек. */
  openSettings() {
    const dialog = this.el.settingsDialog;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  /** Закрывает модальное окно настроек. */
  closeSettings() {
    const dialog = this.el.settingsDialog;
    if (typeof dialog.close === 'function') {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  /**
   * Показывает стандартное браузерное предупреждение (по ТЗ — alert).
   * @param {string} message
   */
  showError(message) {
    window.alert(message);
  }

  /**
   * Показывает короткое всплывающее уведомление об успехе.
   * @param {string} message
   */
  showToast(message) {
    const toast = this.el.toast;
    toast.textContent = message;
    toast.classList.add('is-visible');

    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2600);
  }
}

/* ==========================================================================
   class BudgetApp — главная логика приложения
   ========================================================================== */

class BudgetApp {
  /**
   * @param {Storage} storage
   * @param {UI} ui
   */
  constructor(storage, ui) {
    this.storage = storage;
    this.ui = ui;

    /** @type {Array<object>} */
    this.transactions = [];
    /** @type {{income: string[], expense: string[]}} */
    this.categories = { income: [], expense: [] };
    /** @type {string[]} */
    this.wallets = [];
  }

  /** Инициализация: данные из LocalStorage, события, первая отрисовка. */
  init() {
    this.storage.initializeDefaults();

    this.transactions = this.storage.getTransactions();
    this.categories = this.storage.getCategories();
    this.wallets = this.storage.getWallets();

    this.ui.init();
    this.bindEvents();
    this.render();
  }

  /** Подписка на события интерфейса. */
  bindEvents() {
    const { el } = this.ui;

    // Добавление транзакции.
    el.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleAddTransaction();
    });

    // При смене типа меняется список категорий.
    el.type.addEventListener('change', () => this.handleTypeChange());

    // Удаление транзакции (делегирование событий на список).
    el.transactionsList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-delete-id]');
      if (button) this.handleDeleteTransaction(button.dataset.deleteId);
    });

    // Настройки.
    el.openSettings.addEventListener('click', () => {
      this.ui.renderSettings(this.categories, this.wallets);
      this.ui.openSettings();
    });
    el.closeSettings.addEventListener('click', () => this.ui.closeSettings());
    el.doneSettings.addEventListener('click', () => this.ui.closeSettings());

    // Закрытие по клику на подложку.
    el.settingsDialog.addEventListener('click', (event) => {
      if (event.target === el.settingsDialog) this.ui.closeSettings();
    });

    // Удаление категорий и кошельков (делегирование событий).
    el.incomeCategoriesList.addEventListener('click', (event) =>
      this.handleDeleteCategory(event)
    );
    el.expenseCategoriesList.addEventListener('click', (event) =>
      this.handleDeleteCategory(event)
    );
    el.walletsList.addEventListener('click', (event) => this.handleDeleteWallet(event));

    // Добавление категорий и кошельков.
    el.addCategoryForms.forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        this.handleAddCategory(form);
      });
    });
    el.addWalletForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleAddWallet(el.addWalletForm);
    });
  }

  /** Перерисовывает всё, что зависит от данных. */
  render() {
    this.syncFormSelects();

    const { income, expense } = this.getTotals();
    this.ui.renderBalance(income, expense);

    const sorted = this.getSortedTransactions();
    const latest = sorted.slice(0, 10);

    this.ui.renderTransactions(latest);
    this.ui.renderTransactionsCount(latest.length, this.transactions.length);
    this.ui.renderSettings(this.categories, this.wallets);
  }

  /** Синхронизирует выпадающие списки формы с текущими данными. */
  syncFormSelects() {
    const { type, category, wallet } = this.ui.getFormData();
    const safeType = this.categories[type] ? type : 'expense';

    this.ui.setCategoryOptions(safeType, this.categories[safeType], category);
    this.ui.setWalletOptions(this.wallets, wallet);
  }

  /** Пересчитывает доходы и расходы (в копейках, чтобы избежать ошибок округления). */
  getTotals() {
    let incomeCents = 0;
    let expenseCents = 0;

    this.transactions.forEach((transaction) => {
      const cents = Math.round(transaction.amount * 100);
      if (transaction.type === 'income') {
        incomeCents += cents;
      } else {
        expenseCents += cents;
      }
    });

    return {
      income: incomeCents / 100,
      expense: expenseCents / 100,
    };
  }

  /**
   * Сортирует транзакции по дате (сначала новые).
   * При одинаковой дате выше та запись, которая была добавлена позже.
   * @returns {Array<object>}
   */
  getSortedTransactions() {
    return this.transactions
      .map((transaction, index) => ({ transaction, index }))
      .sort((a, b) => {
        const byDate = b.transaction.date.localeCompare(a.transaction.date);
        if (byDate !== 0) return byDate;
        return b.index - a.index;
      })
      .map((item) => item.transaction);
  }

  /** Обрабатывает смену типа транзакции. */
  handleTypeChange() {
    const type = this.ui.el.type.value;
    this.ui.setCategoryOptions(type, this.categories[type], '');
  }

  /** Валидирует и добавляет новую транзакцию. */
  handleAddTransaction() {
    const data = this.ui.getFormData();
    const amount = parseAmount(data.amount);
    const roundedAmount = Math.round(amount * 100) / 100;

    // Валидация обязательных полей (по ТЗ — alert).
    if (
      data.amount.trim() === '' ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      roundedAmount <= 0
    ) {
      this.ui.showError('Введите корректную сумму больше 0.');
      this.ui.el.amount.focus();
      return;
    }
    if (!data.category) {
      this.ui.showError('Выберите категорию.');
      this.ui.el.category.focus();
      return;
    }
    if (!this.categories[data.type] || !this.categories[data.type].includes(data.category)) {
      this.ui.showError('Выберите категорию из списка.');
      this.ui.el.category.focus();
      return;
    }
    if (!data.wallet) {
      this.ui.showError('Выберите кошелёк.');
      this.ui.el.wallet.focus();
      return;
    }
    if (!this.wallets.includes(data.wallet)) {
      this.ui.showError('Выберите кошелёк из списка.');
      this.ui.el.wallet.focus();
      return;
    }
    if (!data.date) {
      this.ui.showError('Укажите дату транзакции.');
      this.ui.el.date.focus();
      return;
    }

    /** @type {{id: string, type: string, amount: number, category: string, date: string, comment: string, wallet: string}} */
    const transaction = {
      id: createId(),
      type: data.type,
      amount: roundedAmount,
      category: data.category,
      date: data.date,
      comment: data.comment,
      wallet: data.wallet,
    };

    const updated = [...this.transactions, transaction];
    if (!this.storage.saveTransactions(updated)) return;

    this.transactions = updated;
    this.ui.resetForm();
    this.render();
    this.ui.showToast(`Транзакция добавлена: ${formatSignedAmount(transaction)}`);
  }

  /**
   * Удаляет транзакцию после подтверждения.
   * @param {string} id
   */
  handleDeleteTransaction(id) {
    const transaction = this.transactions.find((item) => item.id === id);
    if (!transaction) return;

    const confirmed = window.confirm(
      `Удалить транзакцию «${transaction.category}» на ${formatSignedAmount(transaction)}?`
    );
    if (!confirmed) return;

    const updated = this.transactions.filter((item) => item.id !== id);
    if (!this.storage.saveTransactions(updated)) return;

    this.transactions = updated;
    this.render();
    this.ui.showToast('Транзакция удалена');
  }

  /**
   * Добавляет пользовательскую категорию.
   * @param {HTMLFormElement} form
   */
  handleAddCategory(form) {
    const type = form.dataset.addCategory;
    const input = form.querySelector('input');
    const name = normalizeName(input.value);

    if (!this.categories[type]) return;

    if (!name) {
      this.ui.showError('Введите название категории.');
      input.focus();
      return;
    }

    const exists = this.categories[type].some(
      (category) => category.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      this.ui.showError('Такая категория уже есть в списке.');
      input.select();
      return;
    }

    const updated = {
      income: [...this.categories.income],
      expense: [...this.categories.expense],
    };
    updated[type].push(name);

    if (!this.storage.saveCategories(updated)) return;

    this.categories = updated;
    input.value = '';
    this.render();
    this.ui.showToast(`Категория «${name}» добавлена`);
  }

  /**
   * Удаляет пользовательскую категорию (стандартные защищены).
   * @param {MouseEvent} event
   */
  handleDeleteCategory(event) {
    const button = event.target.closest('button[data-category]');
    if (!button) return;

    const type = button.dataset.categoryType;
    const name = button.dataset.category;

    if (DEFAULT_CATEGORIES[type].includes(name)) {
      this.ui.showError('Стандартную категорию удалить нельзя.');
      return;
    }

    const isUsed = this.transactions.some(
      (transaction) => transaction.type === type && transaction.category === name
    );
    const message = isUsed
      ? `Удалить категорию «${name}»? Существующие транзакции сохранят это название.`
      : `Удалить категорию «${name}»?`;
    if (!window.confirm(message)) return;

    const updated = {
      income: [...this.categories.income],
      expense: [...this.categories.expense],
    };
    updated[type] = updated[type].filter((category) => category !== name);

    if (!this.storage.saveCategories(updated)) return;

    this.categories = updated;
    this.render();
    this.ui.showToast(`Категория «${name}» удалена`);
  }

  /**
   * Добавляет пользовательский кошелёк.
   * @param {HTMLFormElement} form
   */
  handleAddWallet(form) {
    const input = form.querySelector('input');
    const name = normalizeName(input.value);

    if (!name) {
      this.ui.showError('Введите название кошелька.');
      input.focus();
      return;
    }

    const exists = this.wallets.some(
      (wallet) => wallet.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      this.ui.showError('Такой кошелёк уже есть в списке.');
      input.select();
      return;
    }

    const updated = [...this.wallets, name];
    if (!this.storage.saveWallets(updated)) return;

    this.wallets = updated;
    input.value = '';
    this.render();
    this.ui.showToast(`Кошелёк «${name}» добавлен`);
  }

  /**
   * Удаляет пользовательский кошелёк (стандартные защищены).
   * @param {MouseEvent} event
   */
  handleDeleteWallet(event) {
    const button = event.target.closest('button[data-wallet]');
    if (!button) return;

    const name = button.dataset.wallet;

    if (DEFAULT_WALLETS.includes(name)) {
      this.ui.showError('Стандартный кошелёк удалить нельзя.');
      return;
    }

    const isUsed = this.transactions.some((transaction) => transaction.wallet === name);
    const message = isUsed
      ? `Удалить кошелёк «${name}»? Существующие транзакции сохранят это название.`
      : `Удалить кошелёк «${name}»?`;
    if (!window.confirm(message)) return;

    const updated = this.wallets.filter((wallet) => wallet !== name);
    if (!this.storage.saveWallets(updated)) return;

    this.wallets = updated;
    this.render();
    this.ui.showToast(`Кошелёк «${name}» удалён`);
  }
}

/* ---------- Запуск приложения ---------- */

// Скрипт подключён с defer, поэтому DOM к этому моменту уже построен.
const app = new BudgetApp(new Storage(), new UI());
app.init();

// Удобно для отладки через DevTools (вкладка Application → LocalStorage).
window.budgetApp = app;
