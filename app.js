+(function () {
+  const QUADRANTS = [
+    { id: 'q1', key: 'quadrants.q1', arrows: { ArrowRight: 'q2', ArrowDown: 'q3' } },
+    { id: 'q2', key: 'quadrants.q2', arrows: { ArrowLeft: 'q1', ArrowDown: 'q4' } },
+    { id: 'q3', key: 'quadrants.q3', arrows: { ArrowUp: 'q1', ArrowRight: 'q4' } },
+    { id: 'q4', key: 'quadrants.q4', arrows: { ArrowUp: 'q2', ArrowLeft: 'q3' } }
+  ];
+
+  const DB_NAME = 'eisenhower-matrix';
+  const STORE_NAME = 'tasks';
+  const DB_VERSION = 1;
+
+  let db;
+  let tasks = [];
+  let currentEditingId = null;
+  let translations = {};
+  let currentLang = 'fr';
+  let currentSort = 'none';
+  let currentTheme = 'auto';
+  let searchQuery = '';
+
+  const els = {
+    search: document.getElementById('search'),
+    sort: document.getElementById('sort'),
+    languageSelect: document.getElementById('language-select'),
+    themeToggle: document.getElementById('theme-toggle'),
+    exportBtn: document.getElementById('export-btn'),
+    importInput: document.getElementById('import-input'),
+    resetBtn: document.getElementById('reset-btn'),
+    addBtn: document.getElementById('add-task-btn'),
+    dialog: document.getElementById('task-dialog'),
+    form: document.getElementById('task-form'),
+    formError: document.querySelector('.form-error'),
+    announcement: document.getElementById('announcement')
+  };
+
+  function openDB() {
+    return new Promise((resolve, reject) => {
+      const request = indexedDB.open(DB_NAME, DB_VERSION);
+      request.onerror = () => reject(request.error);
+      request.onsuccess = () => resolve(request.result);
+      request.onupgradeneeded = (event) => {
+        const database = event.target.result;
+        if (!database.objectStoreNames.contains(STORE_NAME)) {
+          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
+          store.createIndex('quadrant', 'quadrant', { unique: false });
+          store.createIndex('titleDueQuadrant', ['quadrant', 'title', 'due'], { unique: false });
+        }
+      };
+    });
+  }
+
+  function withStore(type, callback) {
+    return new Promise((resolve, reject) => {
+      const transaction = db.transaction(STORE_NAME, type);
+      const store = transaction.objectStore(STORE_NAME);
+      const result = callback(store);
+      transaction.oncomplete = () => resolve(result);
+      transaction.onerror = () => reject(transaction.error);
+    });
+  }
+
+  async function loadTasks() {
+    const all = await withStore('readonly', (store) => store.getAll());
+    tasks = Array.isArray(all) ? all : [];
+  }
+
+  async function saveTask(task) {
+    task.updatedAt = new Date().toISOString();
+    if (!task.createdAt) {
+      task.createdAt = task.updatedAt;
+    }
+    await withStore('readwrite', (store) => store.put(task));
+  }
+
+  async function deleteTask(id) {
+    await withStore('readwrite', (store) => store.delete(id));
+  }
+
+  async function clearTasks() {
+    await withStore('readwrite', (store) => store.clear());
+  }
+
+  function normalizeString(value) {
+    return (value || '').trim().toLowerCase();
+  }
+
+  function hasDuplicate(task) {
+    const normalizedTitle = normalizeString(task.title);
+    const normalizedDue = normalizeString(task.due);
+    return tasks.some((t) => {
+      if (t.id === task.id) return false;
+      return normalizeString(t.title) === normalizedTitle && normalizeString(t.due) === normalizedDue && t.quadrant === task.quadrant;
+    });
+  }
+
+  function sanitize(value) {
+    const div = document.createElement('div');
+    div.textContent = value ?? '';
+    return div.textContent;
+  }
+
+  function storageGet(key) {
+    try {
+      return localStorage.getItem(key);
+    } catch (error) {
+      console.warn('Storage get failed', error);
+      return null;
+    }
+  }
+
+  function storageSet(key, value) {
+    try {
+      localStorage.setItem(key, value);
+    } catch (error) {
+      console.warn('Storage set failed', error);
+    }
+  }
+
+  function getTranslation(path) {
+    const segments = path.split('.');
+    let current = translations[currentLang];
+    for (const segment of segments) {
+      if (current && Object.prototype.hasOwnProperty.call(current, segment)) {
+        current = current[segment];
+      } else {
+        return '';
+      }
+    }
+    return typeof current === 'string' ? current : '';
+  }
+
+  function announce(messageKey, replacements = {}) {
+    let message = getTranslation(messageKey) || messageKey;
+    Object.entries(replacements).forEach(([key, val]) => {
+      message = message.replace(`{${key}}`, val);
+    });
+    els.announcement.textContent = message;
+  }
+
+  function updateQuadrantCounts() {
+    QUADRANTS.forEach((quadrant) => {
+      const container = document.querySelector(`.quadrant[data-quadrant="${quadrant.id}"]`);
+      const span = container.querySelector('.quadrant-count');
+      const items = tasks.filter((task) => task.quadrant === quadrant.id);
+      const done = items.filter((task) => task.done).length;
+      const total = items.length;
+      const template = getTranslation('quadrants.count') || '{done}/{total}';
+      span.textContent = template.replace('{done}', done).replace('{total}', total);
+    });
+  }
+
+  function applyFilters(list) {
+    let filtered = list.slice();
+    if (searchQuery) {
+      const query = normalizeString(searchQuery);
+      filtered = filtered.filter((task) => {
+        return normalizeString(task.title).includes(query) || normalizeString(task.description).includes(query);
+      });
+    }
+
+    switch (currentSort) {
+      case 'due-asc':
+        filtered.sort((a, b) => {
+          if (!a.due && !b.due) return 0;
+          if (!a.due) return 1;
+          if (!b.due) return -1;
+          return a.due.localeCompare(b.due);
+        });
+        break;
+      case 'due-desc':
+        filtered.sort((a, b) => {
+          if (!a.due && !b.due) return 0;
+          if (!a.due) return 1;
+          if (!b.due) return -1;
+          return b.due.localeCompare(a.due);
+        });
+        break;
+      case 'status':
+        filtered.sort((a, b) => Number(a.done) - Number(b.done));
+        break;
+      default:
+        filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
+    }
+
+    return filtered;
+  }
+
+  function renderTasks() {
+    QUADRANTS.forEach((quadrant) => {
+      const listEl = document.querySelector(`[data-quadrant-list="${quadrant.id}"]`);
+      listEl.innerHTML = '';
+      const filtered = applyFilters(tasks.filter((task) => task.quadrant === quadrant.id));
+
+      filtered.forEach((task) => {
+        const item = document.createElement('li');
+        item.className = `task${task.done ? ' completed' : ''}`;
+        item.setAttribute('draggable', 'true');
+        item.setAttribute('role', 'listitem');
+        item.setAttribute('tabindex', '0');
+        item.setAttribute('aria-grabbed', 'false');
+        item.dataset.id = task.id;
+
+        const header = document.createElement('div');
+        header.className = 'task-header';
+
+        const checkbox = document.createElement('input');
+        checkbox.type = 'checkbox';
+        checkbox.className = 'task-done';
+        checkbox.checked = Boolean(task.done);
+        checkbox.setAttribute('aria-label', getTranslation('tasks.doneToggle') || 'Basculer le statut');
+        checkbox.addEventListener('change', () => toggleTaskDone(task.id, checkbox.checked));
+
+        const title = document.createElement('span');
+        title.className = 'task-title';
+        title.textContent = sanitize(task.title);
+
+        const due = document.createElement('span');
+        due.className = 'task-due';
+        if (task.due) {
+          const date = new Date(task.due);
+          due.textContent = date instanceof Date && !Number.isNaN(date.valueOf())
+            ? date.toLocaleDateString(currentLang)
+            : sanitize(task.due);
+        } else {
+          due.textContent = getTranslation('tasks.noDue') || '';
+        }
+
+        header.append(checkbox, title, due);
+
+        const desc = document.createElement('p');
+        desc.className = 'task-desc';
+        desc.textContent = sanitize(task.description);
+
+        const actions = document.createElement('div');
+        actions.className = 'task-actions';
+
+        const editBtn = document.createElement('button');
+        editBtn.type = 'button';
+        editBtn.textContent = getTranslation('tasks.edit') || 'Modifier';
+        editBtn.addEventListener('click', () => openEditDialog(task.id));
+
+        const deleteBtn = document.createElement('button');
+        deleteBtn.type = 'button';
+        deleteBtn.textContent = getTranslation('tasks.delete') || 'Supprimer';
+        deleteBtn.addEventListener('click', () => confirmDelete(task.id));
+
+        actions.append(editBtn, deleteBtn);
+
+        item.append(header, desc, actions);
+
+        item.addEventListener('dragstart', (event) => onDragStart(event, task.id));
+        item.addEventListener('dragend', onDragEnd);
+        item.addEventListener('keydown', (event) => onTaskKeyDown(event, task.id));
+
+        listEl.appendChild(item);
+      });
+    });
+
+    updateQuadrantCounts();
+  }
+
+  function onDragStart(event, id) {
+    event.dataTransfer.setData('text/plain', id);
+    event.dataTransfer.effectAllowed = 'move';
+    const target = event.target.closest('.task');
+    if (target) {
+      target.classList.add('dragging');
+      target.setAttribute('aria-grabbed', 'true');
+    }
+  }
+
+  function onDragEnd(event) {
+    const target = event.target.closest('.task');
+    if (target) {
+      target.classList.remove('dragging');
+      target.setAttribute('aria-grabbed', 'false');
+    }
+  }
+
+  function setupDropZones() {
+    document.querySelectorAll('.task-list').forEach((list) => {
+      list.setAttribute('aria-dropeffect', 'none');
+      list.addEventListener('dragover', (event) => {
+        event.preventDefault();
+        list.classList.add('drop-target');
+        list.setAttribute('aria-dropeffect', 'move');
+      });
+      list.addEventListener('dragleave', () => {
+        list.classList.remove('drop-target');
+        list.setAttribute('aria-dropeffect', 'none');
+      });
+      list.addEventListener('drop', (event) => {
+        event.preventDefault();
+        list.classList.remove('drop-target');
+        list.setAttribute('aria-dropeffect', 'none');
+        const id = event.dataTransfer.getData('text/plain');
+        if (id) {
+          moveTaskToQuadrant(id, list.dataset.quadrantList, true);
+        }
+      });
+    });
+  }
+
+  async function moveTaskToQuadrant(id, quadrant, announceMove = false) {
+    const task = tasks.find((t) => t.id === id);
+    if (!task || task.quadrant === quadrant) return;
+    task.quadrant = quadrant;
+    await saveTask(task);
+    await loadTasks();
+    renderTasks();
+    if (announceMove) {
+      announce('announcements.moved', {
+        title: sanitize(task.title),
+        quadrant: getTranslation(`quadrants.${quadrant}`) || quadrant
+      });
+    }
+  }
+
+  async function toggleTaskDone(id, done) {
+    const task = tasks.find((t) => t.id === id);
+    if (!task) return;
+    task.done = done;
+    await saveTask(task);
+    await loadTasks();
+    renderTasks();
+  }
+
+  function openDialog(titleKey) {
+    els.form.reset();
+    els.formError.textContent = '';
+    const heading = els.form.querySelector('[data-i18n="dialog.title"]');
+    if (heading) {
+      heading.textContent = getTranslation(`dialog.${titleKey}`) || titleKey;
+    }
+    if (!els.dialog.open) {
+      els.dialog.showModal();
+    }
+    requestAnimationFrame(() => {
+      document.getElementById('task-title').focus();
+    });
+  }
+
+  function openCreateDialog(quadrant = 'q1') {
+    currentEditingId = null;
+    els.form.dataset.mode = 'create';
+    document.getElementById('task-quadrant').value = quadrant;
+    openDialog('titleCreate');
+  }
+
+  function openEditDialog(id) {
+    const task = tasks.find((t) => t.id === id);
+    if (!task) return;
+    currentEditingId = id;
+    els.form.dataset.mode = 'edit';
+    document.getElementById('task-title').value = task.title;
+    document.getElementById('task-desc').value = task.description || '';
+    document.getElementById('task-due').value = task.due || '';
+    document.getElementById('task-quadrant').value = task.quadrant;
+    document.getElementById('task-done').checked = Boolean(task.done);
+    openDialog('titleEdit');
+  }
+
+  async function confirmDelete(id) {
+    const message = getTranslation('tasks.confirmDelete') || 'Supprimer cette tâche ?';
+    if (!window.confirm(message)) return;
+    await deleteTask(id);
+    await loadTasks();
+    renderTasks();
+    announce('announcements.deleted', {});
+  }
+
+  function validateForm(data) {
+    if (!data.title || !data.title.trim()) {
+      return translations[currentLang]?.errors?.titleRequired || 'Titre requis';
+    }
+    if (data.title.trim().length > 140) {
+      return translations[currentLang]?.errors?.titleLength || 'Le titre est trop long';
+    }
+    return '';
+  }
+
+  function getFormData() {
+    const formData = new FormData(els.form);
+    const title = formData.get('title')?.toString().trim();
+    const description = formData.get('description')?.toString().trim();
+    const due = formData.get('due')?.toString();
+    const quadrant = formData.get('quadrant')?.toString();
+    const done = formData.get('done') === 'on';
+    return { title, description, due, quadrant, done };
+  }
+
+  async function handleFormSubmit(event) {
+    event.preventDefault();
+    const data = getFormData();
+    const error = validateForm(data);
+    if (error) {
+      els.formError.textContent = error;
+      return;
+    }
+
+    const id = currentEditingId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
+    const task = {
+      id,
+      title: data.title,
+      description: data.description || '',
+      due: data.due || '',
+      quadrant: data.quadrant || 'q1',
+      done: data.done,
+      createdAt: currentEditingId ? tasks.find((t) => t.id === id)?.createdAt : undefined,
+      updatedAt: new Date().toISOString()
+    };
+
+    if (hasDuplicate(task)) {
+      els.formError.textContent = translations[currentLang]?.errors?.duplicate || 'Une tâche similaire existe déjà';
+      return;
+    }
+
+    await saveTask(task);
+    await loadTasks();
+    renderTasks();
+
+    const successKey = currentEditingId ? 'announcements.updated' : 'announcements.created';
+    announce(successKey, { title: sanitize(task.title) });
+
+    els.dialog.close();
+  }
+
+  function setupForm() {
+    els.addBtn.addEventListener('click', () => openCreateDialog());
+    els.form.addEventListener('submit', handleFormSubmit);
+    els.dialog.addEventListener('close', () => {
+      els.form.reset();
+      els.formError.textContent = '';
+      currentEditingId = null;
+    });
+    els.form.addEventListener('reset', () => {
+      currentEditingId = null;
+    });
+  }
+
+  function setupFilters() {
+    els.search.addEventListener('input', (event) => {
+      searchQuery = event.target.value;
+      renderTasks();
+    });
+    els.sort.addEventListener('change', (event) => {
+      currentSort = event.target.value;
+      renderTasks();
+    });
+  }
+
+  function setupLanguageSwitch() {
+    const savedLang = storageGet('matrix-lang');
+    if (savedLang) {
+      currentLang = savedLang;
+    }
+    els.languageSelect.value = currentLang;
+    els.languageSelect.addEventListener('change', async (event) => {
+      currentLang = event.target.value;
+      storageSet('matrix-lang', currentLang);
+      await loadTranslations();
+      applyTranslations();
+      renderTasks();
+    });
+  }
+
+  function setupThemeToggle() {
+    const savedTheme = storageGet('matrix-theme');
+    if (savedTheme) {
+      currentTheme = savedTheme;
+    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
+      currentTheme = 'dark';
+    } else {
+      currentTheme = 'light';
+    }
+    applyTheme(currentTheme);
+
+    els.themeToggle.addEventListener('click', () => {
+      currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
+      storageSet('matrix-theme', currentTheme);
+      applyTheme(currentTheme);
+    });
+  }
+
+  function applyTheme(theme) {
+    document.documentElement.setAttribute('data-theme', theme);
+    els.themeToggle.setAttribute('aria-pressed', theme === 'dark');
+    const labelKey = theme === 'dark' ? 'controls.themeDark' : 'controls.themeLight';
+    els.themeToggle.textContent = getTranslation(labelKey) || (theme === 'dark' ? 'Sombre' : 'Clair');
+  }
+
+  async function loadTranslations() {
+    const locales = ['fr', 'es'];
+    await Promise.all(locales.map(async (lang) => {
+      if (translations[lang]) return;
+      try {
+        const response = await fetch(`i18n/${lang}.json`);
+        if (!response.ok) throw new Error('Network error');
+        translations[lang] = await response.json();
+      } catch (error) {
+        console.error('Failed to load translations', error);
+        translations[lang] = {};
+      }
+    }));
+    document.documentElement.lang = currentLang;
+  }
+
+  function translateElement(element) {
+    const key = element.dataset.i18n;
+    if (!key) return;
+    const value = getTranslation(key);
+    if (value) {
+      element.textContent = value;
+    }
+  }
+
+  function translatePlaceholders() {
+    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
+      const key = element.dataset.i18nPlaceholder;
+      const value = getTranslation(key);
+      if (value) {
+        element.setAttribute('placeholder', value);
+      }
+    });
+  }
+
+  function applyTranslations() {
+    document.querySelectorAll('[data-i18n]').forEach(translateElement);
+    translatePlaceholders();
+    document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
+      const key = element.dataset.i18nAriaLabel;
+      const value = getTranslation(key);
+      if (value) {
+        element.setAttribute('aria-label', value);
+      }
+    });
+    document.title = getTranslation('app.title') || document.title;
+    applyTheme(currentTheme);
+  }
+
+  function setupCopyButtons() {
+    document.querySelectorAll('.quadrant').forEach((quadrantEl) => {
+      const button = quadrantEl.querySelector('.copy-btn');
+      button.addEventListener('click', async () => {
+        const quadrantId = quadrantEl.dataset.quadrant;
+        const items = applyFilters(tasks.filter((task) => task.quadrant === quadrantId));
+        const lines = items.map((task) => {
+          const dueText = task.due ? new Date(task.due).toLocaleDateString(currentLang) : '';
+          const status = task.done ? getTranslation('tasks.statusDone') : getTranslation('tasks.statusTodo');
+          const safeTitle = sanitize(task.title);
+          const safeDescription = sanitize(task.description);
+          return `- [${status}] ${safeTitle}${dueText ? ` (${dueText})` : ''}${safeDescription ? ` – ${safeDescription}` : ''}`;
+        });
+        const text = lines.join('\n');
+        try {
+          await navigator.clipboard.writeText(text || '');
+          announce('announcements.copied', { quadrant: getTranslation(`quadrants.${quadrantId}`) || quadrantId });
+        } catch (error) {
+          console.error('Clipboard copy failed', error);
+        }
+      });
+    });
+  }
+
+  function setupExportImport() {
+    els.exportBtn.addEventListener('click', () => {
+      const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
+      const url = URL.createObjectURL(blob);
+      const a = document.createElement('a');
+      a.href = url;
+      a.download = 'eisenhower-matrix.json';
+      a.click();
+      setTimeout(() => URL.revokeObjectURL(url), 1000);
+    });
+
+    els.importInput.addEventListener('change', async (event) => {
+      const file = event.target.files?.[0];
+      if (!file) return;
+      try {
+        const text = await file.text();
+        const data = JSON.parse(text);
+        if (!Array.isArray(data)) throw new Error('Invalid file');
+        const seen = new Set();
+        const sanitized = data.reduce((acc, item) => {
+          const title = sanitize(item.title).slice(0, 140);
+          if (!title) return acc;
+          const due = item.due || '';
+          const quadrant = QUADRANTS.some((q) => q.id === item.quadrant) ? item.quadrant : 'q1';
+          const key = `${quadrant}|${normalizeString(title)}|${normalizeString(due)}`;
+          if (seen.has(key)) return acc;
+          seen.add(key);
+          acc.push({
+            id: typeof item.id === 'string' ? item.id : (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
+            title,
+            description: sanitize(item.description || ''),
+            due,
+            quadrant,
+            done: Boolean(item.done),
+            createdAt: item.createdAt || new Date().toISOString(),
+            updatedAt: new Date().toISOString()
+          });
+          return acc;
+        }, []);
+        await clearTasks();
+        for (const task of sanitized) {
+          await saveTask(task);
+        }
+        await loadTasks();
+        renderTasks();
+        announce('announcements.imported', {});
+      } catch (error) {
+        console.error('Import failed', error);
+        announce('announcements.importError', {});
+      } finally {
+        event.target.value = '';
+      }
+    });
+  }
+
+  function setupReset() {
+    els.resetBtn.addEventListener('click', async () => {
+      const confirmMessage = getTranslation('controls.resetConfirm') || 'Supprimer toutes les données ?';
+      if (!window.confirm(confirmMessage)) return;
+      await clearTasks();
+      await loadTasks();
+      renderTasks();
+      announce('announcements.reset', {});
+    });
+  }
+
+  function onTaskKeyDown(event, id) {
+    const key = event.key;
+    if (key === 'Enter' || key === ' ') {
+      event.preventDefault();
+      openEditDialog(id);
+      return;
+    }
+    if (key === 'Delete') {
+      event.preventDefault();
+      confirmDelete(id);
+      return;
+    }
+    if (!event.altKey) return;
+    const currentTask = tasks.find((task) => task.id === id);
+    if (!currentTask) return;
+    const currentQuadrant = QUADRANTS.find((q) => q.id === currentTask.quadrant);
+    const nextQuadrant = currentQuadrant?.arrows?.[key];
+    if (nextQuadrant) {
+      event.preventDefault();
+      moveTaskToQuadrant(id, nextQuadrant, true);
+    }
+  }
+
+  function setupAccessibility() {
+    document.querySelectorAll('.task-list').forEach((list) => {
+      list.setAttribute('role', 'list');
+      list.setAttribute('tabindex', '0');
+      list.addEventListener('keydown', (event) => {
+        if (event.key === 'Enter' || event.key === ' ') {
+          event.preventDefault();
+          openCreateDialog(list.dataset.quadrantList);
+        }
+      });
+    });
+  }
+
+  function registerServiceWorker() {
+    if ('serviceWorker' in navigator) {
+      window.addEventListener('load', () => {
+        navigator.serviceWorker.register('pwa/service-worker.js').catch((error) => {
+          console.error('Service worker registration failed', error);
+        });
+      });
+    }
+  }
+
+  async function init() {
+    const savedLang = storageGet('matrix-lang');
+    if (savedLang) {
+      currentLang = savedLang;
+    }
+    try {
+      db = await openDB();
+    } catch (error) {
+      console.error('IndexedDB unavailable', error);
+    }
+    if (!db) {
+      announce('announcements.dbError', {});
+      return;
+    }
+    await loadTranslations();
+    applyTranslations();
+    setupLanguageSwitch();
+    setupThemeToggle();
+    setupForm();
+    setupFilters();
+    setupDropZones();
+    setupCopyButtons();
+    setupExportImport();
+    setupReset();
+    setupAccessibility();
+    registerServiceWorker();
+
+    await loadTasks();
+    renderTasks();
+  }
+
+  document.addEventListener('DOMContentLoaded', init);
+})();
