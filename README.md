# clova2Mail 📧

**clova2Mail** is a powerful Chrome Extension that seamlessly integrates with [ClovaNote](https://clovanote.naver.com/) to email your meeting minutes via Gmail — either as an AI-powered summary (OpenAI) or as the raw transcript, your choice.

## ✨ Features

- **One-Click Integration**: Adds a native-feeling "clova2Mail" button directly into the ClovaNote website UI.
- **AI-Powered Summaries**: Automatically extracts your meeting transcript and uses OpenAI (GPT) to generate a clean, structured summary including Action Items and Decisions.
- **Raw Transcript Send**: Send the original meeting transcript as-is without AI summarization — no OpenAI API key required.
- **Direct Gmail Sending**: Securely connects to your Gmail account via OAuth2 to send meeting notes without leaving the page.
- **Customizable Templates**: Edit the email subject and body using variables like `{title}`, `{date}`, `{summary}`, `{decisions}`, and `{action_items}`.
- **Privacy-First API Key Mgt**: Your OpenAI API key is stored securely in your local browser storage — no intermediate backends. The key is optional if you only use raw transcript sending.

## 🛠️ Tech Stack

- **Framework**: React 19, Vite, TypeScript
- **Styling**: Tailwind CSS
- **Extension Tooling**: `@crxjs/vite-plugin`
- **APIs**: Chrome Extension API, Gmail API, OpenAI API

## 🚀 Getting Started

To run this project locally or install it for personal use, you need to set up your own API credentials.

### 1. Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/seoha-labs/clova2-mail.git
   cd clova2-mail
   ```
2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
   This will generate a `dist` folder.

### 2. Google Cloud OAuth Setup (CRITICAL)

Because this extension uses the Gmail API to send emails directly from the user's account, it requires a Google Cloud OAuth2 Client ID. **For security reasons in this public repository, the `client_id` in `manifest.json` is left intentionally blank.**

Follow these steps to generate your own and make the extension work:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., "clova2Mail-OAuth").
3. Navigate to **APIs & Services > Library** and enable the **Gmail API**.
4. Navigate to **OAuth consent screen** and configure it (choose "External" or "Internal" depending on your needs). You must add the scopes:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/userinfo.email`
5. Navigate to **Credentials** > **Create Credentials** > **OAuth client ID**.
6. Select **Chrome app** as the Application type.
7. Entering the **Application ID (Item ID)**:
   - To get this ID, go to `chrome://extensions/` in your browser.
   - Enable **Developer mode** (top right).
   - Click **Load unpacked** and select your project's `dist` folder.
   - Chrome will assign an **ID** to your extension (e.g., `abcdefghijklmnopqrstuvwxyz123456`).
   - Copy this ID and paste it into the "Application ID" field in Google Cloud Console.
8. Click **Create** and copy your newly generated **Client ID**.

### 3. Update `manifest.json`

Open `manifest.json` in the root directory and paste your **Client ID** into the `oauth2.client_id` field:

```json
  "oauth2": {
    "client_id": "YOUR_GOOGLE_CLIENT_ID_HERE",
    "scopes": [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email"
    ]
  }
```

After editing `manifest.json`, run `npm run build` again, and click the **Reload** button on `chrome://extensions/` to apply the changes.

### 4. Setup OpenAI API Key (Optional)

> **Note**: This step is only required if you want to use AI-powered summarization. If you only need to send raw transcripts, skip this step and just add your email recipients.

1. Click on the **clova2Mail** extension icon in your Chrome toolbar.
2. In the popup window, enter your **OpenAI API Key** (`sk-...`).
3. Click **Verify (검증)** to ensure the key works.
4. Add your frequent email recipients, and you're good to go!

## 📦 Building for Production

To create a production-ready build for the Chrome Web Store:

```bash
npm run build
```
Then Zip the `dist` folder and upload it to the Chrome Developer Dashboard. Note that you may need to lock your Extension ID using a `key.pem` file if you plan to distribute it, so that your OAuth Client ID remains valid. (Ensure `*.pem` remains in your `.gitignore`).
