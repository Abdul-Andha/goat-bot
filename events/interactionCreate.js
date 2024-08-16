export const name = "interactionCreate";
export async function execute(interaction) {
  if (!interaction.isCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    if (err) console.error(err);
    await interaction.reply({
      content: "An error occurred. Contact @Thunder#6228 if the issue persists. Error code: 00"
    });
  }
}