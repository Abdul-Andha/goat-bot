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
      },{
        name: '/schedule',
        value: 'Suggests optimal meeting times based on recent conversation.\n**Example usage:** `/schedule`\n\nThe bot will analyze the last 25 messages in the current channel to propose three possible meeting times, taking user preferences into account (such as after 5 PM and weekends). Users can then vote on the suggested times, and the bot will select the time with at least two votes. Once scheduled, daily reminders will be sent leading up to the meeting.',
      },
      {
        name: '/remindme',
        value: 'Set a reminder.\n**Example:** `/remindme message: Stand up and stretch! minutes: 30`',
      },
      {
        name: '/research',
        value: 'Perform deep research on any topic using AI and web search.\n**Example:** `/research query: Impact of AI on healthcare breadth: 3 depth: 2`\n\nThe bot will search the web for information, analyze the results, and generate a comprehensive report. The breadth parameter (1-10) controls how many different search queries to perform, and the depth parameter (1-5) controls how many levels of follow-up research to conduct.',
      },
    )
    .setFooter({ text: 'Use /help anytime to see this message again.' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}