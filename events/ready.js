import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

export const name = 'ready';
export const once = true;
export async function execute(bot, commands) {
  console.log('Connected as ' + bot.user.tag);
  const CLIENT_ID = bot.user.id;

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Successfully registered commands.');
  } catch (err) {
    console.error(err);
  }
}