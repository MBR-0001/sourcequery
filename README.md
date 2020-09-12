# SourceQuery

https://www.npmjs.com/package/sourcequery but it doesn't suck

Valve docs: https://developer.valvesoftware.com/wiki/Server_queries

## Usage

Install with npm:

    npm install mbr-0001/sourcequery

Example usage:

```js
const SourceQuery = require('sourcequery');

const query = new SourceQuery('127.0.0.1', 28015, 1000, true); // 1000ms timeout, automatically close connection 250ms after last request

query.getInfo().then(info => console.log('Server Info:', info));
query.getPlayers().then(players => console.log('Online Players:', players));
query.getRules().then(rules => console.log('Server Rules:', rules));
//if autoclose is false this method has to be called to stop the query from preventing the process from exiting
query.close();
```

## Supported Games
AppID | Game | Query | Notes |
----- | ---- | :---: | ----- |
x | All HL1/HL2 games and mods | :white_check_mark: |
10 | [Counter-Strike 1.6](https://store.steampowered.com/app/10/) | :white_check_mark: | 
20 | [Team Fortress Classic](https://store.steampowered.com/app/440/) | :white_check_mark: | 
440 | [Team Fortress 2](https://store.steampowered.com/app/440/) | :white_check_mark: | 
550 | [Left 4 Dead](https://store.steampowered.com/app/500/) | :white_check_mark: | 
550 | [Left 4 Dead 2](https://store.steampowered.com/app/550/) | :white_check_mark: | 
730 | [Counter-Strike: Global Offensive](https://store.steampowered.com/app/730/) | :white_check_mark: |
2400 | [The Ship](https://store.steampowered.com/app/2400/) | :white_check_mark: | 
4000 | [Garry's Mod](https://store.steampowered.com/app/4000/) | :white_check_mark: |
17710 | [Nuclear Dawn](https://store.steampowered.com/app/17710/) | :white_check_mark: |
70000 | [Dino D-Day](https://store.steampowered.com/app/70000/) | :white_check_mark: |
33900 | [Arma 2](https://store.steampowered.com/app/107410/) | :white_check_mark: |
107410 | [Arma 3](https://store.steampowered.com/app/107410/) | :white_check_mark: | rules are broken thanks to devs |
211820 | [Starbound](https://store.steampowered.com/app/211820/) | :white_check_mark: | rules and players cannot be requested at the same time |
244850 | [Space Engineers](https://store.steampowered.com/app/244850/) | :white_check_mark: |
251570 | [7 Days to Die](https://store.steampowered.com/app/251570) | :white_check_mark: |
252490 | [Rust](https://store.steampowered.com/app/252490/) | :white_check_mark: |
282440 | [Quake Live](https://store.steampowered.com/app/282440) | :white_check_mark: |
304930 | [Unturned](https://store.steampowered.com/app/304930/) | :white_check_mark: | Server does not send rules
346110 | [ARK: Survival Evolved](https://store.steampowered.com/app/346110/) | :white_check_mark: |
393380 | [Squad](https://store.steampowered.com/app/393380/) | :white_check_mark: |
418460 | [Rising Storm 2: Vietnam](https://store.steampowered.com/app/418460/) | :white_check_mark: |
440900 | [Conan Exiles](https://store.steampowered.com/app/440900/) | :white_check_mark: | Server does not send rules
529180 | [Dark and Light](https://store.steampowered.com/app/529180/) | :white_check_mark: | Server does not send rules
736220 | [Post Scriptum](https://store.steampowered.com/app/736220/) | :white_check_mark: |
834910 | [ATLAS](https://store.steampowered.com/app/834910/) | :white_check_mark: |