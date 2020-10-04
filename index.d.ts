class SourceQuery {
    constructor(address: string, port: number, timeout?: number, autoclose?: boolean);
    getInfo(): Promise<ServerInfo>;
    getPlayers(): Promise<PlayerInfo[]>;
    getRules(): Promise<Record<string, string>>;
    close(): void;
}

interface ServerInfo {
    protocol: number;
    name: string;
    map: string;
    folder: string;
    game: string;
    appid: number;
    players: number;
    maxplayers: number;
    bots: number;
    servertype: string;
    environment: string;
    password: boolean;
    vac: boolean;
    version: string;
    port?: number;
    steamID?: string;
    keywords?: string;
    gameID?: string;
    ship?: ShipInfo;
}

interface ShipInfo {
    mode: number;
    witnesses: number;
    duration: number;
}

interface PlayerInfo {
    index: number;
    name: string;
    score: number;
    online: number;
}

export = SourceQuery;