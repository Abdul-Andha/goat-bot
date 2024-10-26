// commands/help.js

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('List all available commands with examples.');

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle('Bot Commands Help')
    .setDescription('Here are all the available commands and how to use them:')
    .addFields(
      {
        name: '/ai',
        value: 'Ask the AI anything!\n**Example:** `/ai prompt: What is the capital of France?`',
      },
      {
        name: '/joke',
        value: 'Get a random joke.\n**Example:** `/joke`',
      },
      {
        name: '/poll',
        value: 'Create a poll.\n**Example with options:** `/poll question: What is your favorite color? options: Red, Blue, Green`\n**Example without options:** `/poll question: What should we have for lunch?`',
      },
      {
        name: '/remindme',
        value: 'Set a reminder.\n**Example:** `/remindme message: Stand up and stretch! minutes: 30`',
      },
      // Add more commands here if needed
    )
    .setFooter({ text: 'Use /help anytime to see this message again.' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}