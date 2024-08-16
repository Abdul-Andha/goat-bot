//Imports
import { readdirSync } from 'fs';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

//Setting new client
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

//Slash Command Handler
const commandFiles = readdirSync("./commands").filter(file => file.endsWith(".js"));
const commands = [];
bot.commands = new Collection();

for (const file of commandFiles) {
  const command = await import(`./commands/${file}`);
  commands.push(command.data.toJSON());
  bot.commands.set(command.data.name, command);
}

//Permissions Handler


//Event Handler
const eventFiles = readdirSync("./events").filter(file => file.endsWith(".js"));

for (const file of eventFiles) {
  const event = await import(`./events/${file}`);
  if (event.once) {
    bot.once(event.name, (...args) => event.execute(...args, commands))
  } else {
    bot.on(event.name, (...args) => event.execute(...args, commands))
  }

}

//Login
bot.login(process.env.TOKEN);