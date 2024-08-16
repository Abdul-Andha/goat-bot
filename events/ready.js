import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import dotenv from 'dotenv';
dotenv.config();

export const name = "ready";
export const once = "true";
export async function execute(bot, commands) {
  console.log("Connected as " + bot.user.tag);
  const CLIENT_ID = bot.user.id;

  const rest = new REST({
    version: 9
  }).setToken(process.env.TOKEN);

  (async () => {
    try {
      // if (process.env.ENV === "production") {
      // await rest.put(Routes.applicationCommands(CLIENT_ID), {
      //   body: commands
      // });
      // console.log("Sucessfully registered commands globally.");
      // } else {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, process.env.GUILD_ID), {
        body: commands
      });
      console.log("Sucessfully registered commands locally.", bot.commands);
      // }
    } catch (err) {
      if (err) console.error(err);
    }
  })();
}