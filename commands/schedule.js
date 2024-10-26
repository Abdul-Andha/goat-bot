
import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
  } from 'discord.js';
  import { Configuration, OpenAIApi } from 'openai';
  import dotenv from 'dotenv';
  import axios from 'axios'; // For time API if needed
  import { createRequire } from 'module'; // To import CommonJS modules
  dotenv.config();
  
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);
  
  const require = createRequire(import.meta.url);
  const chrono = require('chrono-node'); // Importing chrono-node using require
  
  export const data = new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Suggests meeting times based on recent conversation.');
  
  export async function execute(interaction) {
    await interaction.deferReply();
  
    try {
      // Fetch the last 25 messages
      const messages = await interaction.channel.messages.fetch({ limit: 25 });
      const recentMessages = Array.from(messages.values()).reverse(); // Oldest to newest
  
      // Filter out bot messages and keep only content
      const conversation = recentMessages
        .filter((msg) => !msg.author.bot)
        .map((msg) => `${msg.author.username}: ${msg.content}`)
        .join('\n');
  
      // Anonymize messages (replace mentions with placeholders)
      const anonymizedConversation = conversation.replace(/<@!?(\d+)>/g, '[user]');
  
      // Prepare the prompt for OpenAI
      const prompt = `
  You are an assistant that helps schedule meetings based on conversation.
  Given the following messages, suggest three possible meeting times that would work for everyone.
  Times should be on the hour (e.g., 5 PM, 6 PM) and after 5 PM or on weekends are preferred.
  Only list the times in a clear format (e.g., "Monday at 6 PM").
  
  Messages:
  ${anonymizedConversation}
  
  Suggested Meeting Times:
  `;
  
      // Call OpenAI Chat Completion API
      const response = await openai.createChatCompletion({
        model: 'gpt-4o-mini', // Use 'gpt-4' if available and you have access
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 1,
      });
  
      // Extract suggestions
      let suggestionsText = response.data.choices[0].message.content.trim();
  
      // Proceed with the rest of your code...
      // For example:
      // Ensure suggestions are on the hour
      suggestionsText = adjustTimesToHour(suggestionsText);
  
      // Split suggestions into an array
      const suggestions = suggestionsText.split('\n').filter((line) => line);
  
      // Create buttons for each suggestion
      const buttons = suggestions.map((suggestion, index) => {
        return new ButtonBuilder()
          .setCustomId(`schedule_select_${index}`)
          .setLabel(suggestion)
          .setStyle(ButtonStyle.Primary);
      });
  
      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }
  
      // Send the suggestions to the channel
      const embed = new EmbedBuilder()
        .setTitle('🗓️ Proposed Meeting Times')
        .setDescription('Please vote for the meeting time that works for you:')
        .setColor(0x00ff00);
  
      const message = await interaction.editReply({ embeds: [embed], components: rows });
  
      // Collect button interactions
      const filter = (i) => i.customId.startsWith('schedule_select_');
  
      const collector = message.createMessageComponentCollector({
        filter,
        time: 60000,
      });
  
      // Track votes
      const votes = {};
  
      collector.on('collect', async (i) => {
        const userId = i.user.id;
        const selectedIndex = parseInt(i.customId.replace('schedule_select_', ''));
        const selectedTime = suggestions[selectedIndex];
  
        // Initialize vote count if not exists
        if (!votes[selectedTime]) {
          votes[selectedTime] = new Set();
        }
  
        votes[selectedTime].add(userId);
  
        await i.reply({
          content: `You voted for **${selectedTime}**.`,
          ephemeral: true,
        });
  
        // Check if any time has at least 2 votes
        const winningTime = Object.keys(votes).find((time) => votes[time].size >= 2);
  
        if (winningTime) {
          collector.stop('time_selected');
          await finalizeMeeting(interaction, winningTime, votes[winningTime]);
        }
      });
  
      collector.on('end', async (collected, reason) => {
        if (reason !== 'time_selected') {
          await interaction.editReply({
            content: 'No meeting time received enough votes. The scheduling has been canceled.',
            embeds: [],
            components: [],
          });
        }
      });
    } catch (error) {
        console.error('Error in /schedule command:', error);
    
        if (error.response) {
          console.error('OpenAI API Error:', error.response.status, error.response.data);
          await interaction.editReply('An error occurred while contacting the AI service. Please try again later.');
        } else {
          await interaction.editReply('An unexpected error occurred. Please try again later.');
        }
      }
    }
  
  // Helper function to adjust times to the hour
  function adjustTimesToHour(suggestionsText) {
    const lines = suggestionsText.split('\n');
    const adjustedLines = lines.map((line) => {
      return line.replace(/(\d+)(:\d+)?\s*(AM|PM)/gi, (match, hour, minutes, period) => {
        return `${hour} ${period.toUpperCase()}`;
      });
    });
    return adjustedLines.join('\n');
  }
  
  // Function to finalize the meeting
  async function finalizeMeeting(interaction, selectedTime, voters) {
    // Identify relevant users (voters)
    const participantIds = Array.from(voters);
  
    // Acknowledge the selection
    await interaction.editReply({
      content: `Meeting scheduled for **${selectedTime}**. Daily reminders will be sent leading up to the meeting.`,
      embeds: [],
      components: [],
    });
  
    // Calculate delay and schedule reminders
    const delays = calculateDelays(selectedTime);
  
    if (delays) {
      scheduleReminders(interaction, selectedTime, participantIds, delays);
    } else {
      await interaction.followUp('Could not parse the selected time for scheduling.');
    }
  }
  
  // Function to calculate delays for reminders
  function calculateDelays(selectedTime) {
    // Implement parsing of selectedTime to a Date object
    // For simplicity, assume the time is in "Day at HH AM/PM" format
    // Return an array of delays for daily reminders
  
    // Example: ["Monday at 6 PM"]
  
    const parsedDate = chrono.parseDate(selectedTime);
  
    if (!parsedDate) {
      return null;
    }
  
    const now = new Date();
    const daysUntilMeeting = Math.ceil((parsedDate - now) / (1000 * 60 * 60 * 24));
  
    if (daysUntilMeeting <= 0) {
      return null;
    }
  
    const delays = [];
    for (let i = daysUntilMeeting; i > 0; i--) {
      const reminderTime = new Date(parsedDate.getTime() - i * 24 * 60 * 60 * 1000);
      const delay = reminderTime.getTime() - now.getTime();
      if (delay > 0) {
        delays.push(delay);
      }
    }
  
    // Final reminder at the meeting time
    delays.push(parsedDate.getTime() - now.getTime());
  
    return delays;
  }
  
  // Function to schedule reminders
  function scheduleReminders(interaction, selectedTime, participantIds, delays) {
    delays.forEach((delay, index) => {
      setTimeout(async () => {
        const mentions = participantIds.map((id) => `<@${id}>`).join(', ');
        const reminderMessage =
          index === delays.length - 1
            ? `${mentions}\n⏰ **Reminder:** The meeting is starting now!`
            : `${mentions}\n⏰ **Reminder:** ${index + 1} day(s) left until the meeting on **${selectedTime}**.`;
  
        await interaction.followUp({
          content: reminderMessage,
          allowedMentions: { users: participantIds },
        });
      }, delay);
    });
  }