# 🤖 Node.js Бот (MongoDB + Socket.io)

Этот проект — бот, написанный на **Node.js**.  
Он использует **MongoDB** (базу данных) и **socket.io** (для работы в реальном времени).  

Ниже пошаговое руководство, чтобы запустить бота

---

## 📦 Что нужно установить один раз

### 1. Node.js
Node.js — это «движок», на котором работает бот.  
Скачайте и установите [Node.js LTS](https://nodejs.org) (зелёная кнопка LTS).  

После установки:
- На Windows откройте **PowerShell**  
- На Linux / Mac откройте **Terminal**  

Введите:
```bash
node -v
npm -v
```

## VS code (Visual Studio Code)
VS code поможет вам открыть и запустить код.
Скачайте и установите [Visula Studio Code](https://code.visualstudio.com/) (зелёная кнопка).  

После установки:
Откройте код, скачанный с Github или из zip-архива, в VS Code. Чтобы получить код из zip-архива, извлеките файлы из него и откройте их в VS Code.

## Настроить базу данных MongoDB
Бот хранит информацию в базе данных:

Установить локально ():

Скачайте [MongoDB Community Server](https://www.mongodb.com/try/download/community)

Установите и запустите MongoDB

Действия:
После загрузки нажимайте только кнопку «Далее», пока не увидите кнопку «Готово».
Если вам нужно создать какие-либо соединения в MongoDB Compass, создайте их под именем «conference-bot». Только для этого кода.

## 🚀 Как запустить бота

### 1. Скачать проект

На GitHub нажмите Code → Download ZIP

Распакуйте архив в папку:

Windows: C:\my-bot

Linux: /home/user/my-bot

### 2. Установить зависимости

Откройте терминал в папке проекта и выполните:

```npm install```

Это установит все необходимые библиотеки.

### 3. Запустить бота

```npm run dev```

Если всё хорошо, появится надпись:
```
🚀 Server running on port 3001
📺 Second screen API: http://localhost:3001/api/second-screen
Second screen connected
✅ Connected to MongoDB
```

Теперь бот работает 🎉
Бот будет работать под именем @conference_miniApp_bot.
