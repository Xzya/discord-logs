import * as fs from "fs";
import * as request from "request";

export interface DiscordOptions {
    token?: string;
    settings?: DiscordSettings;
}

export interface DiscordSettings {
    baseUrl: string;
}

export interface Filter {
    around?: string;
    before?: string;
    after?: string;
    limit?: number;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface Credentials {
    token: string;
}

const defaultSettings: DiscordSettings = {
    baseUrl: "https://discordapp.com/api/v6",
};

export class DiscordAPI {
    protected token: string = "";
    protected settings: DiscordSettings = defaultSettings;

    constructor(options?: DiscordOptions) {
        if (options) {
            if (options.token) {
                this.token = options.token;
            }
            if (options.settings) {
                this.settings = options.settings;
            }
        }
    }

    public request<T>(options: (request.UriOptions & request.CoreOptions)): Promise<T> {
        return new Promise((fulfill, reject) => {
            return request(options, (err, res, body) => {
                if (err) return reject(err);
                if (res.statusCode !== 200) {
                    return reject(new Error(`Unexpected status code ${res.statusCode}`));
                }
                return fulfill(body);
            });
        });
    }

    public setToken(token: string) {
        this.token = token;
    }

    public login(req: LoginRequest): Promise<Credentials> {
        return this.request({
            baseUrl: this.settings.baseUrl,
            uri: `/auth/login`,
            method: "POST",
            gzip: true,
            json: true,
            body: req,
        });
    }

    public getDMChannels(): Promise<any[]> {
        return this.request({
            baseUrl: this.settings.baseUrl,
            uri: `/users/@me/channels`,
            method: "GET",
            headers: {
                "Authorization": this.token,
            },
            gzip: true,
            json: true,
        });
    }

    public getChannelMessages(id: string, filter?: Filter): Promise<any[]> {
        return this.request({
            baseUrl: this.settings.baseUrl,
            uri: `/channels/${id}/messages`,
            method: "GET",
            headers: {
                "Authorization": this.token,
            },
            gzip: true,
            json: true,
            qs: filter,
        });
    }

    public getGuilds(): Promise<any[]> {
        return this.request({
            baseUrl: this.settings.baseUrl,
            uri: `/users/@me/guilds`,
            method: "GET",
            headers: {
                "Authorization": this.token,
            },
            gzip: true,
            json: true,
        });
    }

    public getGuildChannels(id: string): Promise<any[]> {
        return this.request({
            baseUrl: this.settings.baseUrl,
            uri: `/guilds/${id}/channels`,
            method: "GET",
            headers: {
                "Authorization": this.token,
            },
            gzip: true,
            json: true,
        });
    }

}

if (!process.env.DATA_PATH) {
    throw new Error("DATA_PATH environment variable not set");
}

if (!process.env.TOKEN) {
    throw new Error("TOKEN environment variable not set");
}

const client = new DiscordAPI({
    token: process.env.TOKEN,
});

async function main() {
    const limit = 100;

    const messagesPath = `${process.env.DATA_PATH}/messages`;
    const channelsPath = `${process.env.DATA_PATH}/channels`;

    console.log(`Synchronizing messages...`);

    // get the user's DM channels
    let channels = await client.getDMChannels();

    // if we also need to sync guilds
    if (process.env.SYNC_GUILDS) {
        const guildIds = process.env.SYNC_GUILDS.split(",");

        // get the user's guilds
        const guilds = await client.getGuilds();

        // search for whitelisted guilds
        for (const guild of guilds) {
            for (const guildId of guildIds) {
                if (guild.id === guildId) {
                    // get the guild's channels and add them to the DMs
                    const guildChannels = await client.getGuildChannels(guild.id);
                    channels = channels.concat(guildChannels);
                }
            }
        }
    }

    console.log(`Got ${channels.length} channels`);

    for (const channel of channels) {
        console.log(`Processing ${channel.id} (${channel.name}) channel`);

        // check if we already had the channel
        if (fs.existsSync(`${channelsPath}/${channel.id}.json`)) {
            // if the channel already existed, we need to check if there are any missing messages
            const existingChannel = JSON.parse(fs.readFileSync(`${channelsPath}/${channel.id}.json`, "utf-8"));

            // if the last_message_id matches
            if (existingChannel.last_message_id === channel.last_message_id) {
                console.log(`Channel ${channel.id} (${channel.name}) is already synchronized`);
                // messages for this channel are already synced
                continue;
            }

            console.log(`Channel ${channel.id} (${channel.name}) exists but is missing messages. Synchronizing...`);

            // otherwise we need to download the missing ones
            // start at existingChannel.last_message_id
            let after = existingChannel.last_message_id;
            do {
                // get the messages
                const messages = await client.getChannelMessages(channel.id, {
                    limit,
                    after,
                });

                console.log(`Got ${messages.length} messages for channel ${channel.id} (${channel.name})`);

                // save them to disk
                for (const message of messages) {
                    fs.writeFileSync(`${messagesPath}/${message.id}.json`, `${JSON.stringify(message)}${"\n"}`);
                    // the \n is necessary for logstash to work correctly, also don't add formatting to the json
                }

                // check if we need to get more messages for this channel
                if (messages.length === limit) {
                    after = messages[0].id;
                } else {
                    break;
                }
            } while (true);
        } else {
            console.log(`New channel ${channel.id} (${channel.name}). Synchronizing...`);

            // if we don't have it, then we need to synchronize all messages
            let before: string | undefined;
            do {
                // get the messages
                const messages = await client.getChannelMessages(channel.id, {
                    limit,
                    before,
                });

                console.log(`Got ${messages.length} messages for channel ${channel.id} (${channel.name})`);

                // save them to disk
                for (const message of messages) {
                    fs.writeFileSync(`${messagesPath}/${message.id}.json`, `${JSON.stringify(message)}${"\n"}`);
                }

                // check if we need to get more messages for this channel
                if (messages.length === limit) {
                    before = messages[messages.length - 1].id;
                } else {
                    break;
                }
            } while (true);
        }

        // when we're done synchronizing the messages, also save the channel
        fs.writeFileSync(`${channelsPath}/${channel.id}.json`, `${JSON.stringify(channel)}${"\n"}`);
    }

    console.log("All messages synchronized");
}

let interval: number;
let isProcessing = false;

async function loop() {
    if (!isProcessing) {
        isProcessing = true;
        await main();
        isProcessing = false;
    }

    setTimeout(loop, interval);
}

if (process.env.INTERVAL) {
    interval = parseInt(process.env.INTERVAL);

    if (isNaN(interval)) {
        throw new Error(`Invalid INTERVAL: ${process.env.INTERVAL}`);
    }

    loop();
} else {
    main();
}
