# GaGa Chat — Google Play content rating questionnaire (answers)

Package: `gagachat.app` · Version 2.8.14
Category: **Communication** · Application type: **Application**

In the Play Console open **App content → Content rating**, choose **All other app
types** (the questionnaire for apps that are not games), then answer exactly as
below. The expected outcome is **Everyone / PEGI 3 / IARC 3+** with no
interactive-element warnings beyond user-generated content.

---

## Category

- **Select the category that best describes your app:** All other app types
  (not a game).

---

## Questionnaire

| # | Question | Answer | Notes |
| --- | --- | --- | --- |
| 1 | Does your app contain any of the following: violence, blood, sexual content, nudity, language, controlled substances, gambling, or horror/fear? | **No** to every sub-item | GaGa is a messenger; it hosts no such content of its own. |
| 2 | Does your app allow users to interact or exchange content? | **Yes** | Users can message, call, and share media. |
| 3 | Does your app share the user's current location with other users? | **Yes** | Only when the user explicitly chooses to send it. |
| 4 | Does your app allow users to purchase digital goods? | **No** | No live purchases; the wallet is a preview only. |
| 5 | Does your app contain advertising? | **No** | No ad SDK is bundled. |
| 6 | Does your app allow users to make or receive calls? | **Yes** | 1:1 voice and video calls (LiveKit). |
| 7 | Is the app primarily a social/dating app? | **No** | It is a general-purpose messenger. |
| 8 | Does the app contain user-generated content that is not moderated? | **Yes — user-generated content is possible** | See the moderation note below. |
| 9 | Does the app let users share their location? | **Yes** | Same as #3. |
| 10 | Does the app collect personal data from children? | **No** | The app is not directed at children under 13. |

---

## Interactive elements (the checkboxes Play derives from your answers)

Play will ask you to confirm these interactive-element flags. Tick exactly:

- [x] **Users interact** — messaging, calling, and media sharing between users.
- [x] **Shares location** — the user can send their location.
- [x] **Users can share user-generated content** — messages, photos, videos,
  voice notes, documents.
- [ ] Digital purchases — **not ticked** (no live purchases).
- [ ] Unrestricted internet — **not ticked** (the app has no open web browser).

---

## Moderation / safety note (paste into the "Additional information" box if asked)

> GaGa Chat is a private messenger. Users can only start a conversation with
> people they have added, and message requests keep unknown senders out of the
> inbox. Every chat offers block and report controls, and there is an in-app
> blocked-users list. The app shows no advertising and hosts no third-party
> content feeds. Location is shared only on explicit user action. The app is not
> directed at children under 13.

---

## Expected result

| Rating board | Expected rating |
| --- | --- |
| IARC generic | 3+ |
| ESRB | Everyone |
| PEGI | 3 |
| USK | 0 |
| ACB | G |

If Play returns anything higher, re-check answers #2/#8 (user interaction is the
only reason a messenger can be rated above 3+), and confirm that "digital
purchases" and "advertising" are both **No**.
