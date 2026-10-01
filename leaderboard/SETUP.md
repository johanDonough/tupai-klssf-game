# Setting up the leaderboard Sheet

About 10 minutes. It works the same way as the registration page's Sheet, but it is a **separate, new Sheet**. Use the same Google account (your tupai.ai one), since that one already allowed "Anyone" for a web app.

## 1. Create the Sheet and add the script

1. Create a new Google Sheet. Name it something like **Tupai Nutty Hero leaderboard**.
2. In the Sheet, open **Extensions > Apps Script**.
3. Delete everything in the editor. Paste in the whole of [`Code.gs`](Code.gs).
4. Click the save icon. Name the project if asked, for example **Nutty Hero leaderboard**.

## 2. Set up the tabs

1. Go back to the Sheet and reload the page. A **Tupai Nutty Hero** menu appears after a few seconds.
2. Click **Tupai Nutty Hero > 1. Set up this sheet**.
   - The first time, Google asks for permission. Choose your account and click **Allow**. If it warns that the app isn't verified, click **Advanced**, then **Go to (project name)**.
   - If nothing seems to happen after allowing, click the menu item once more.
   - You should now have two tabs: **Scores** and **Blocked words**.

There is no passcode this time. Nothing in this Sheet is private: it holds nicknames and scores, no personal data.

## 3. Publish the script as a web app

1. In the Apps Script tab, click **Deploy > New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**. Copy the **Web app URL**. It ends in `/exec`.
5. Send that URL to Claude. It goes into the game's settings file (`public/content/config.json`), and the leaderboard switches on.

## 4. Check it

Open the web app URL in a browser. You should see a line of text like:

```
{"day":"2026-10-01","today":[],"weekend":[]}
```

Once the game is wired up, finish a run and watch the row appear in the **Scores** tab.

## Before the event

Click **Tupai Nutty Hero > Go live: clear test scores**. It deletes every score and keeps the blocked words.

Never run "Go live" during or after the event. It deletes the scores.

## During the event

- **Scores tab:** every finished run that the player chose to submit, newest at the bottom. The game shows today's top 20 and the weekend's top 20.
- **A rude or unwanted name:** tick its **Hide** box. It leaves the board within a few seconds, and unticking brings it back. Deleting the row also works, but can't be undone.
- **Blocked words tab:** add a word at the bottom and choose **anywhere** or **whole word** next to it.
  - **anywhere** blocks it inside a longer name too.
  - **whole word** only blocks it on its own. Use this for short words that sit inside real names, such as "dick" inside "Dickson".
  - A new word applies within a minute, to new names and to scores already on the board.
- **No limits:** there is no cap on scores and no limit on how often someone submits (your decision). A visitor who posts a silly number can be hidden with the tick box.

## Update for difficulty levels (1 Oct)

The game now has three levels, Junior (Easy), Tupai (Normal) and Tupai Hero (Hard), each with its own leaderboard. The Sheet needs the new script once:

1. Open the Sheet, then **Extensions > Apps Script**.
2. Delete everything in the editor, paste in the whole of the new [`Code.gs`](Code.gs), and save.
3. **Deploy > Manage deployments**, click the pencil icon, set **Version: New version**, and click **Deploy**. The web app URL stays the same.

That's all. A **Level** column appears in the Scores tab with the next score posted. Scores from before the update count as Tupai Hero (Hard). Until the script is updated, the game still works, with one shared board.

## If the script is changed later

In Apps Script, paste the new code, save, then **Deploy > Manage deployments > pencil icon > Version: New version > Deploy**.

Do not use "New deployment" again. That creates a different URL and the game would lose the leaderboard.

## What Google will ask permission for

- **See, edit, create and delete your spreadsheets:** to read and write the scores.

The Sheet is not shared with anyone by this setup. The game never reads the Sheet directly; it only gets what the script chooses to answer.
