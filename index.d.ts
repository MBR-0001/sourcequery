class SourceQuery {
    constructor(address: string, port: number, timeout?: number);
    getInfo(): Promise<ServerInfo>;
    getPlayers(): Promise<PlayerInfo[]>;
    getRules(): Promise<Record<string, string>>;
}

interface ServerInfo {
    protocol: number,
    name: string,
    map: string,
    folder: string,
    game: string,
    appid: number,
    players: number,
    maxplayers: number,
    bots: number,
    servertype: string,
    environment: string,
    password: number,
    vac: number,
    version: string,
    port: number,
    steamID: number,
    keywords: string,
    gameID: number
}

interface PlayerInfo {
    index: number,
    name: string,
    score: number,
    online: number
}

export = SourceQuery;