# Discord logs

Download all your Discord messages locally in `json` files.

## Installation

- Install the dependencies

```bash
$ npm install
```

## Running the project

```bash
$ DATA_PATH=<PATH> TOKEN=<TOKEN> npm start
```

| Variable | Description | Required |
| --- | --- | --- |
| `DATA_PATH` | Path to the directory where the messages will be stored. | `true` |
| `TOKEN` | User's authorization token. Used for the API calls when getting the messages. | `true` |
| `SYNC_GUILDS` | `Optional`. If you also want to synchronize the messages of a guild, you can include the ids separated by comma, e.g. `id1,id2,id3`. | `false` |
| `INTERVAL` | `Optional`. You can specity the interval, in miliseconds, when the messages should be synchronized, e.g. every 10 minutes. If not specified, the script will exit after synchronizing once. | `false` |

You can also build the project if you don't want to rely on `ts-node`.

```bash
$ npm run build
$ DATA_PATH=<PATH> TOKEN=<TOKEN> node dist/index.js
```

## Elasticsearch

If you want to index the messages in `Elasticsearch`, you can find an example `Logstash` config in `logstash.conf`.

**Note**: The example config uses the `Prune` plugin which doesn't come installed by default. To install it, run from the Logstash installation folder:

```bash
./bin/logstash-plugin install logstash-filter-prune
```

More details [here](https://www.elastic.co/guide/en/logstash/current/plugins-filters-prune.html#_installation_59).

## License

Open sourced under the [MIT license](./LICENSE.md).
