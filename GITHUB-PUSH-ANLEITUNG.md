# TiefbauX – Projekt zu GitHub pushen

## Voraussetzung: Git installieren

Git ist auf deinem System aktuell **nicht installiert**. Bitte zuerst installieren:

1. **Git for Windows** herunterladen: https://git-scm.com/download/win  
2. Installation durchführen (Standard-Optionen reichen).  
3. **Terminal/Cursor neu starten**, damit `git` im PATH verfügbar ist.

---

## Dein GitHub-Repository

Du brauchst die **URL deines leeren GitHub-Repositories**, z. B.:

- `https://github.com/DEIN-BENUTZERNAME/TiefbauX.git`  
  oder  
- `https://github.com/DEIN-BENUTZERNAME/anderer-repo-name.git`

Falls du das Repo noch nicht erstellt hast:

1. Auf https://github.com einloggen  
2. **New repository**  
3. Namen vergeben (z. B. `TiefbauX`), **ohne** „Initialize with README“  
4. URL kopieren (z. B. `https://github.com/DEIN-USER/TiefbauX.git`)

---

## Schritte zum Pushen (nach Git-Installation)

**Alle Befehle im Projektordner ausführen:**  
`c:\Users\User\Desktop\TiefbauX`

### 1. Repository initialisieren und ersten Commit erstellen

```powershell
cd "c:\Users\User\Desktop\TiefbauX"
git init
git add .
git commit -m "Initial commit: TiefbauX Projekt"
```

### 2. Remote hinzufügen und pushen (mit Access Token)

Ersetze in den Befehlen:

- **DEIN-GITHUB-USER** = dein GitHub-Benutzername  
- **REPO-NAME** = Name des Repositories (z. B. `TiefbauX`)  
- **DEIN-ACCESS-TOKEN** = dein GitHub Personal Access Token (den du neu anlegst, siehe unten)

```powershell
git remote add origin https://DEIN-GITHUB-USER:DEIN-ACCESS-TOKEN@github.com/DEIN-GITHUB-USER/REPO-NAME.git
git branch -M main
git push -u origin main
```

**Beispiel**, wenn User `maxmustermann` und Repo `TiefbauX` heißt:

```powershell
git remote add origin https://maxmustermann:DEIN-ACCESS-TOKEN@github.com/maxmustermann/TiefbauX.git
git branch -M main
git push -u origin main
```

---

## Wichtig: Zugangsdaten (Token)

- **Token nicht** in Skripten oder im Chat dauerhaft teilen.  
- Den **in dieser Unterhaltung geteilten Token** solltest du in GitHub unter  
  **Settings → Developer settings → Personal access tokens** **sofort widerrufen** und einen **neuen Token** mit z. B. Berechtigung `repo` anlegen.  
- Beim nächsten Push kannst du den neuen Token wieder in der URL verwenden oder Git nach dem Passwort fragen lassen (dann Token als Passwort eingeben).

---

## Kurz-Checkliste

- [ ] Git for Windows installiert, Terminal neu gestartet  
- [ ] GitHub-Repository erstellt und URL kopiert  
- [ ] Alten Token widerrufen, neuen Token erstellt (optional, aber empfohlen)  
- [ ] `git init` und `git add .` und `git commit` im Projektordner ausgeführt  
- [ ] `git remote add origin ...` mit deiner URL und deinem Token ausgeführt  
- [ ] `git push -u origin main` ausgeführt  

Wenn du möchtest, kannst du mir danach deine **Repository-URL** (ohne Token) und deinen **GitHub-Benutzernamen** nennen – dann formuliere ich dir die exakten Befehle zum Copy & Paste.
