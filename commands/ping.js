import { SlashCommandBuilder } from "@discordjs/builders";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("pong");
export async function execute(interaction) {
  interaction.reply("Pong!");
}