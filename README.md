# SourceQuery

https://www.npmjs.com/package/sourcequery but it doesn't suck

Valve docs: https://developer.valvesoftware.com/wiki/Server_queries

## Usage

Install with npm:

    npm install mbr-0001/sourcequery

Example usage:

```js
const SourceQuery = require('sourcequery');

const query = new SourceQuery('127.0.0.1', 28015, 1000, true); // 1000ms timeout, automatically close connection after last request [last 2 options are optional]

query.getInfo().then(info => console.log('Server Info:', info));
query.getPlayers().then(players => console.log('Online Players:', players));
query.getRules().then(rules => console.log('Server Rules:', rules));
//if autoclose is false this method has to be called to stop the query from preventing the process from exiting
query.close();
```

## Supported Games
AppID | Game | Notes |
----- | ---- | ----- |
x | All HL1/HL2 games and mods |
10 | [Counter-Strike 1.6](https://store.steampowered.com/app/10/) |
20 | [Team Fortress Classic](https://store.steampowered.com/app/440/) |
440 | [Team Fortress 2](https://store.steampowered.com/app/440/) |
550 | [Left 4 Dead](https://store.steampowered.com/app/500/) |
550 | [Left 4 Dead 2](https://store.steampowered.com/app/550/) |
730 | [Counter-Strike: Global Offensive](https://store.steampowered.com/app/730/) |
2400 | [The Ship](https://store.steampowered.com/app/2400/) |
4000 | [Garry's Mod](https://store.steampowered.com/app/4000/) |
17710 | [Nuclear Dawn](https://store.steampowered.com/app/17710/) |
70000 | [Dino D-Day](https://store.steampowered.com/app/70000/) |
33900 | [Arma 2](https://store.steampowered.com/app/107410/) |
107410 | [Arma 3](https://store.steampowered.com/app/107410/) | rules are broken thanks to [devs](https://forums.bohemia.net/forums/topic/189090-source-protocol-problem-when-querying-servers/) |
211820 | [Starbound](https://store.steampowered.com/app/211820/) | rules and players cannot be requested at the same time |
244850 | [Space Engineers](https://store.steampowered.com/app/244850/) |
251570 | [7 Days to Die](https://store.steampowered.com/app/251570) |
252490 | [Rust](https://store.steampowered.com/app/252490/) |
282440 | [Quake Live](https://store.steampowered.com/app/282440) |
304930 | [Unturned](https://store.steampowered.com/app/304930/) |
346110 | [ARK: Survival Evolved](https://store.steampowered.com/app/346110/) |
393380 | [Squad](https://store.steampowered.com/app/393380/) |
418460 | [Rising Storm 2: Vietnam](https://store.steampowered.com/app/418460/) |
440900 | [Conan Exiles](https://store.steampowered.com/app/440900/) | Server does not send rules
529180 | [Dark and Light](https://store.steampowered.com/app/529180/) |
736220 | [Post Scriptum](https://store.steampowered.com/app/736220/) |
834910 | [ATLAS](https://store.steampowered.com/app/834910/) |

## Notes
- Compression is not supported, I don't know of any games that use it
- Player list gets fucked up if people put weird shit in their names (emojis and other weird shit)
- Since 1.0.5 steamID and gameID in getInfo are strings (they are BigInt and it cannot be JSON.stringify-d)