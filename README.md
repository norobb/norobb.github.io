# norobb.github.io

My personal site: who I am, Untis Neo, Dayflow, and a little week planner where friends can type a plan and send it to me on Discord.

Plain HTML, CSS and JavaScript, no build step. GitHub Pages serves the `main` branch as it is.

- `index.html`: the page
- `style.css`, `tokens.css`, `base.css`: styles (colours and fonts live in `tokens.css`)
- `plan.js`: turns text like "minecraft friday 8pm" into a day, time and title
- `main.js`: planner, screen switcher, language picker
- `images/`: app screenshots

Test the parser: `node plan.test.js`
Preview locally: `python3 -m http.server` and open http://localhost:8000
