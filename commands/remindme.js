// commands/remindme.js

import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('remindme')
  .setDescription('Set a reminder.')
  .addStringOption((option) =>
    option
      .setName('message')
      .setDescription('The reminder message.')
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName('days')
      .setDescription('Number of days from now.')
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName('hours')
      .setDescription('Number of hours from now.')
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName('minutes')
      .setDescription('Number of minutes from now.')
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName('seconds')
      .setDescription('Number of seconds from now.')
      .setRequired(false)
  );

export async function execute(interaction) {
  const message = interaction.options.getString('message');
  const days = interaction.options.getInteger('days') || 0;
  const hours = interaction.options.getInteger('hours') || 0;
  const minutes = interaction.options.getInteger('minutes') || 0;
  const seconds = interaction.options.getInteger('seconds') || 0;

  // Calculate the total delay in milliseconds
  const totalDelay =
    (days * 24 * 60 * 60 +
      hours * 60 * 60 +
      minutes * 60 +
      seconds) * 1000;

  if (totalDelay <= 0) {
    await interaction.reply({
      content: 'Please specify a time in the future.',
      ephemeral: true,
    });
    return;
  }

  // Get the reminder time
  const remindTime = new Date(Date.now() + totalDelay);

  // Confirm the reminder to the user
  await interaction.reply({
    content: `⏰ I will remind you on <t:${Math.floor(
      remindTime.getTime() / 1000
    )}:F>.`,
    ephemeral: true,
  });

  // Store channel and user information
  const channelId = interaction.channelId;
  const userId = interaction.user.id;

  // Set the timeout
  setTimeout(async () => {
    try {
      const channel = await interaction.client.channels.fetch(channelId);
      if (!channel) {
        console.error('Channel not found.');
        return;
      }

      // Send the reminder message, pinging the user
      await channel.send({
        content: `<@${userId}> ⏰ **Reminder:** ${message}`,
      });
    } catch (error) {
      console.error('Error sending reminder message:', error);
    }
  }, totalDelay);
}