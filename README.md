# ⚖ Compliance Monitor — Marshall

Веб-приложение для ежеквартального мониторинга изменений законодательства.
Комментарии и ознакомления хранятся в Firebase Firestore — видны всем пользователям в реальном времени.

---

## Подключение Firebase (10 минут)

### 1. Создайте проект

1. Откройте [console.firebase.google.com](https://console.firebase.google.com)
2. Нажмите **Add project** → введите название → отключите Google Analytics (необязательно) → **Create project**

### 2. Создайте базу данных Firestore

1. В левом меню: **Build → Firestore Database**
2. Нажмите **Create database**
3. Выберите **Start in test mode** (разрешает чтение/запись всем — подходит для внутреннего инструмента)
4. Выберите регион (например, `europe-west3` — Франкфурт) → **Enable**

### 3. Получите конфиг приложения

1. В левом меню нажмите шестерёнку → **Project settings**
2. Прокрутите вниз до раздела **Your apps** → нажмите иконку `</>`  (Web)
3. Введите название приложения → **Register app**
4. Скопируйте объект `firebaseConfig` — он выглядит так:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "my-project.firebaseapp.com",
  projectId: "my-project",
  storageBucket: "my-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc"
};
```

### 4. Вставьте конфиг в app.js

В самом начале `app.js` замените блок `FIREBASE_CONFIG`:

```js
const FIREBASE_CONFIG = {
  apiKey:            "AIza...",           // ← ваши значения
  authDomain:        "my-project.firebaseapp.com",
  projectId:         "my-project",
  storageBucket:     "my-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc"
};
```

### 5. Ограничьте доступ по домену (рекомендуется)

В Firebase Console → **Project settings → Authorized domains** → добавьте ваш GitHub Pages URL:
`ваш-логин.github.io`

Это означает, что Firebase будет принимать запросы только с вашего сайта.

### 6. Залейте файлы на GitHub — готово

Все пользователи будут видеть комментарии друг друга в реальном времени без перезагрузки страницы.

---

## Обновление данных (для юристов)

**Способ 1 — через форму в приложении:**
Нажмите **⊕ Добавить изменение** в левой панели.

**Способ 2 — редактирование `data.js`:**

```js
{
  id: "pub-6",
  num: 6,
  category: "Трудовое право / ...",
  title: "Название изменения",
  summary: "Подробное описание...",
  normAct: "ФЗ от ... № ...",
  effectiveDate: "2026-10-01",
  sanctions: "Штраф...",
  criticality: "Средняя",   // Высокая / Средняя / Низкая / Отсутствует
  impact: "Влияние...",
  mitigation: "Что сделать...",
  deadline: "До 01.10.2026",
  departments: ["ФЭД", "КД"],
  status: "Учесть в работе"
}
```

---

## Структура файлов

```
├── index.html   — разметка
├── styles.css   — фирменный стиль Marshall
├── data.js      — данные НПА (редактируется юристами)
├── app.js       — логика + Firebase
└── README.md
```

## Бесплатные лимиты Firebase (Spark plan)

| Параметр | Лимит |
|---|---|
| Операции чтения | 50 000 / день |
| Операции записи | 20 000 / день |
| Хранилище | 1 GB |

Для внутреннего compliance-инструмента с десятками пользователей этого более чем достаточно.

---

## Добавление пользователей (Authentication)

### Включите Email/Password вход

1. Firebase Console → **Build → Authentication**
2. Вкладка **Sign-in method** → нажмите **Email/Password** → включите первый переключатель → **Save**

### Создайте аккаунты сотрудников

1. Вкладка **Users** → **Add user**
2. Введите рабочий email и пароль сотрудника → **Add user**
3. Повторите для каждого сотрудника

> ⚠️ Самостоятельная регистрация отключена — только вы создаёте аккаунты. Уволившийся сотрудник удаляется из списка Users одной кнопкой.

### Что видит пользователь

При входе сотрудник вводит email, пароль и выбирает свой департамент (ДУП, ФЭД и т.д.). В комментариях будет отображаться и email, и роль — это даёт полную прозрачность в журнале ознакомлений.

### Сброс пароля

В Firebase Console → Authentication → Users → найдите пользователя → **Reset password** — на его email придёт письмо со ссылкой.
