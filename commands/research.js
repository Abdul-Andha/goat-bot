// Helper function to send research report to Discord with error handling
// Helper function to send research report to Discord with error handling
async function sendReportToDiscord(interaction, query, researchId, reportChunks) {
  try {
    // If we have chunks to send
    if (reportChunks.length > 0) {
      // Send the first chunk as an edit to our progress message
      await interaction.editReply({
        content: `📊 **Research Report: ${query}** (ID: ${researchId})\n\n${reportChunks[0]}`,
      });
      
      console.log(`Sent first chunk (${reportChunks[0].length} characters)`);
      
      // Send any additional chunks as follow-up messages with a small delay between each
      for (let i = 1; i < reportChunks.length; i++) {
        try {
          await delay(1000); // 1 second delay between messages
          await interaction.followUp({
            content: reportChunks[i],
          });
          console.log(`Sent chunk ${i + 1} (${reportChunks[i].length} characters)`);
        } catch (error) {
          console.error(`Error sending chunk ${i + 1}:`, error);

          // If we hit a character limit, try breaking it down further
          if (error.code === 50035) {
            // Use the same smaller limit as splitReportForDiscord
            const subchunks = [];
            const MAX_SUBCHUNK_SIZE = 1800; 
            
            for (let j = 0; j < reportChunks[i].length; j += MAX_SUBCHUNK_SIZE) {
              subchunks.push(reportChunks[i].substring(j, j + MAX_SUBCHUNK_SIZE));
            }
            
            for (let k = 0; k < subchunks.length; k++) {
              await delay(1000);
              await interaction.followUp({
                content: subchunks[k],
              });
              console.log(
                `Sent emergency subchunk ${k + 1} of chunk ${i + 1} (${subchunks[k].length} characters)`
              );
            }
          }
        }
      }
      
      return true;
    } else {
      await interaction.editReply({
        content: `⚠️ Failed to generate a research report for: ${query}`,
      });
      return false;
    }
  } catch (error) {
    console.error('Error sending report to Discord:', error);
    try {
      await interaction.editReply({
        content: `⚠️ Error sending the research report: ${error.message}. The report may be too large for Discord.`,
      });
    } catch (followupError) {
      console.error('Error sending error message:', followupError);
    }
    return false;
  }
}
  import { SlashCommandBuilder } from 'discord.js';
  import axios from 'axios';
  import dotenv from 'dotenv';
  import FirecrawlApp from '@mendable/firecrawl-js';
  import { v4 as uuidv4 } from 'uuid';
  import fs from 'fs/promises';
  
  dotenv.config();
  
  // Helper function to add delay
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Initialize Firecrawl
  const firecrawl = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_KEY || '',
    // Optional base URL if you're using a self-hosted version
    // apiUrl: process.env.FIRECRAWL_BASE_URL,
  });
  
  // Concurrency limit for parallel requests
  const CONCURRENCY_LIMIT = 2;
  
  // Define the command structure
  export const data = new SlashCommandBuilder()
    .setName('research')
    .setDescription('Perform deep research on a topic')
    .addStringOption(option =>
      option
        .setName('query')
        .setDescription('The research topic or question')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('breadth')
        .setDescription('Research breadth (2-10)')
        .setMinValue(1)
        .setMaxValue(10)
    )
    .addIntegerOption(option =>
      option
        .setName('depth')
        .setDescription('Research depth (1-5)')
        .setMinValue(1)
        .setMaxValue(5)
    );
  
  export async function execute(interaction) {
    // Defer reply immediately since this will take time
    await interaction.deferReply();
    
    try {
      const query = interaction.options.getString('query');
      const breadth = interaction.options.getInteger('breadth') || 2;
      const depth = interaction.options.getInteger('depth') || 3;
      
      // Generate a unique ID for this research session
      const researchId = uuidv4().substring(0, 8);
      
      // Step 1: Ask follow-up questions to narrow down the research
      await interaction.editReply({
        content: `🔍 Research preparation for: **${query}** (ID: ${researchId})\n\nGenerating follow-up questions to better understand your research needs...`,
      });
      
      // Generate follow-up questions to clarify research intent
      const followUpQuestions = await generateFollowUpQuestions(query);
      
      if (followUpQuestions.length > 0) {
        // Create a collector for the follow-up questions
        const filter = m => m.author.id === interaction.user.id;
        const answers = [];
        
        // Show the questions and collect answers one by one
        for (let i = 0; i < followUpQuestions.length; i++) {
          const question = followUpQuestions[i];
          
          await interaction.editReply({
            content: `🔍 Research preparation for: **${query}** (ID: ${researchId})\n\n**Question ${i+1}/${followUpQuestions.length}:** ${question}\n\n*Please answer this question in your next message to help narrow down the research focus.*\n\n*Type "skip" to skip this question or "cancel" to stop the research.*`,
          });
          
          try {
            // Wait for the user's response with a timeout
            const collected = await interaction.channel.awaitMessages({
              filter,
              max: 1,
              time: 120000,  // 2 minute timeout
              errors: ['time']
            });
            
            const response = collected.first().content;
            
            // Handle special commands
            if (response.toLowerCase() === 'cancel') {
              await interaction.editReply({
                content: `❌ Research canceled by user.`,
              });
              return;
            } else if (response.toLowerCase() === 'skip') {
              answers.push('[Skipped]');
            } else {
              answers.push(response);
            }
          } catch (error) {
            // Timeout occurred
            answers.push('[No response - timed out]');
            await interaction.followUp({
              content: `⚠️ No response received, moving to the next question.`,
              ephemeral: true
            });
          }
        }
        
        // Combine original query with follow-up answers
        const enhancedQuery = `
  Initial Query: ${query}
  
  Follow-up Questions and Answers:
  ${followUpQuestions.map((q, i) => `Q: ${q}\nA: ${answers[i]}`).join('\n\n')}
        `;
        
        await interaction.editReply({
          content: `🔍 Starting deep research on: **${query}** (ID: ${researchId})\n\nThank you for the additional context. Beginning research with breadth: ${breadth}, depth: ${depth}.\n\nThis may take several minutes...`,
        });
        
        // Create a progress updater to keep the user informed
        const updateProgress = async (stage, details = '') => {
          const progressBar = createProgressBar(stage, depth);
          await interaction.editReply({
            content: `🔍 Researching: **${query}** (ID: ${researchId})\n\n${progressBar}\n\n${details || 'Working on it...'}`,
          });
        };
        
        // Start the research process with enhanced query
        await updateProgress('planning', 'Planning research queries...');
        
        // Main research execution with the enhanced query
        const { learnings, visitedUrls } = await deepResearch({
          query: enhancedQuery,
          breadth,
          depth,
          onProgress: async (progress) => {
            const stage = `Depth ${progress.currentDepth}/${progress.totalDepth}`;
            const details = progress.currentQuery 
              ? `Researching: ${progress.currentQuery} (Query ${progress.completedQueries + 1}/${progress.totalQueries})`
              : `Planning next queries...`;
            
            await updateProgress(stage, details);
          }
        });
        
        // When research is complete, generate the final report
        await updateProgress('finalizing', 'Generating final report...');
        
        const report = await writeFinalReport({
          prompt: enhancedQuery,
          learnings,
          visitedUrls
        });
        
        // Split the report into chunks with a stricter 1950 character limit for safety
        const reportChunks = splitReportForDiscord(report);
        
        // Send the first chunk as an edit to our progress message
        await interaction.editReply({
          content: `📊 **Research Report: ${query}** (ID: ${researchId})\n\n${reportChunks[0]}`,
        });
        
        // Send any additional chunks as follow-up messages
        for (let i = 1; i < reportChunks.length; i++) {
          await interaction.followUp({
            content: reportChunks[i],
          });
        }
        
        // Save the full report to a file
        const filename = `research-${researchId}.md`;
        await fs.writeFile(filename, report, 'utf-8');
        
        // Send a final message with metadata about the research
        await interaction.followUp({
          content: `📋 **Research Summary**\n` +
            `• Sources checked: ${visitedUrls.length}\n` +
            `• Key insights: ${learnings.length}\n` +
            `• Report saved as: \`${filename}\`\n\n` +
            `For reference, your research ID is: \`${researchId}\``,
        });
      } else {
        // Skip the follow-up questions if none were generated
        await interaction.editReply({
          content: `🔍 Starting deep research on: **${query}** (ID: ${researchId})\n\nBreadth: ${breadth}, Depth: ${depth}\n\nThis may take several minutes...`,
        });
        
        // Standard research flow without follow-up clarification
        const updateProgress = async (stage, details = '') => {
          const progressBar = createProgressBar(stage, depth);
          await interaction.editReply({
            content: `🔍 Researching: **${query}** (ID: ${researchId})\n\n${progressBar}\n\n${details || 'Working on it...'}`,
          });
        };
        
        await updateProgress('planning', 'Planning research queries...');
        
        const { learnings, visitedUrls } = await deepResearch({
          query,
          breadth,
          depth,
          onProgress: async (progress) => {
            const stage = `Depth ${progress.currentDepth}/${progress.totalDepth}`;
            const details = progress.currentQuery 
              ? `Researching: ${progress.currentQuery} (Query ${progress.completedQueries + 1}/${progress.totalQueries})`
              : `Planning next queries...`;
            
            await updateProgress(stage, details);
          }
        });
        
        await updateProgress('finalizing', 'Generating final report...');
        
        const report = await writeFinalReport({
          prompt: query,
          learnings,
          visitedUrls
        });
        
        // Split the report with a strict 1950 character limit for safety
        const reportChunks = splitReportForDiscord(report);
        
        // Save the full report to a file
        const filename = `research-${researchId}.md`;
        await fs.writeFile(filename, report, 'utf-8');
        
        // Send report to Discord with error handling
        const reportSent = await sendReportToDiscord(interaction, query, researchId, reportChunks);
        
        // Only send the summary if the report was successfully sent
        if (reportSent) {
          await interaction.followUp({
            content: `📋 **Research Summary**\n` +
              `• Sources checked: ${visitedUrls.length}\n` +
              `• Key insights: ${learnings.length}\n` +
              `• Report saved as: \`${filename}\`\n\n` +
              `For reference, your research ID is: \`${researchId}\``,
          });
        }
      }
    } catch (error) {
      console.error('Error in research command:', error);
      
      // Provide a meaningful error message to the user
      await interaction.editReply({
        content: `⚠️ There was an error conducting your research: ${error.message}\n\nPlease try again later or with a more specific query.`,
      });
    }
  }
  
  // Function to create a visual progress indicator
  function createProgressBar(stage, totalDepth) {
    const depthNumber = parseInt(stage.split('/')[0].replace('Depth ', ''));
    const progress = Math.max(0, Math.min(1, (totalDepth - depthNumber + 1) / totalDepth));
    const filledBlocks = Math.floor(progress * 10);
    
    const filled = '█'.repeat(filledBlocks);
    const empty = '░'.repeat(10 - filledBlocks);
    
    return `${filled}${empty} ${stage}`;
  }
  
  // Function to generate follow-up questions to narrow research focus
  async function generateFollowUpQuestions(query, numQuestions = 3) {
    try {
      // Call Anthropic Claude API to generate follow-up questions
      const response = await axios({
        method: 'post',
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        data: {
          model: 'claude-3-7-sonnet-20250219',
          max_tokens: 500,
          temperature: 0.7,
          system: getSystemPrompt(),
          messages: [
            {
              role: 'user',
              content: `Given the following query from the user, ask some follow-up questions to clarify the research direction. Return a maximum of ${numQuestions} questions, but feel free to return less if the original query is clear and focused. Make the questions specific and designed to narrow down the scope of research: <query>${query}</query>
              
              Your response should be in the following JSON format:
              {
                "questions": [
                  "First follow-up question that would help clarify research focus",
                  "Second follow-up question addressing a different aspect",
                  "Third follow-up question for further clarification"
                ]
              }`
            }
          ]
        }
      });
  
      // Extract and parse the response
      const content = response.data.content[0].text;
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/({[\s\S]*})/);
      
      let parsedData;
      if (jsonMatch && jsonMatch[1]) {
        parsedData = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON without code blocks
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          parsedData = JSON.parse(content.substring(jsonStart, jsonEnd + 1));
        } else {
          throw new Error('Failed to parse JSON response for follow-up questions');
        }
      }
      
      console.log(`Generated ${parsedData.questions.length} follow-up questions`);
      return parsedData.questions.slice(0, numQuestions);
    } catch (error) {
      console.error('Error generating follow-up questions:', error);
      return []; // Return empty array on error
    }
  }
  
  // Function to split long reports into Discord-friendly chunks
  // Function to split long reports into Discord-friendly chunks
function splitReportForDiscord(report) {
  // Use a smaller limit so we don't exceed 2000 characters when we
  // prepend extra text in editReply or followUp calls.
  const MAX_CHUNK_SIZE = 1800; 
  const chunks = [];

  // Try to split at natural markdown section headers first
  const sections = report.split(/(?=##? )/);

  let currentChunk = '';

  for (const section of sections) {
    // If this section would make the chunk too big
    if (currentChunk.length + section.length > MAX_CHUNK_SIZE) {
      // Add the current chunk if it has content
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      // Now handle the section if it's too big on its own
      if (section.length > MAX_CHUNK_SIZE) {
        // Split by paragraphs
        const paragraphs = section.split(/\n\n+/);

        if (paragraphs.length > 1) {
          let paragraphChunk = '';

          for (const paragraph of paragraphs) {
            // If adding this paragraph would exceed our limit
            if (paragraphChunk.length + paragraph.length + 2 > MAX_CHUNK_SIZE) {
              if (paragraphChunk.length > 0) {
                chunks.push(paragraphChunk);
                paragraphChunk = '';
              }

              // If a single paragraph is still too big, split by sentences
              if (paragraph.length > MAX_CHUNK_SIZE) {
                const sentences = paragraph.split(/(?<=[.!?])\s+/);
                let sentenceChunk = '';

                for (const sentence of sentences) {
                  if (sentenceChunk.length + sentence.length + 1 > MAX_CHUNK_SIZE) {
                    if (sentenceChunk.length > 0) {
                      chunks.push(sentenceChunk);
                      sentenceChunk = '';
                    }
                    // If even a single sentence is too big, force-split by characters
                    if (sentence.length > MAX_CHUNK_SIZE) {
                      for (let i = 0; i < sentence.length; i += MAX_CHUNK_SIZE) {
                        chunks.push(sentence.substring(i, i + MAX_CHUNK_SIZE));
                      }
                    } else {
                      sentenceChunk = sentence + ' ';
                    }
                  } else {
                    sentenceChunk += sentence + ' ';
                  }
                }

                if (sentenceChunk.length > 0) {
                  chunks.push(sentenceChunk);
                }
              } else {
                paragraphChunk = paragraph + '\n\n';
              }
            } else {
              paragraphChunk += paragraph + '\n\n';
            }
          }

          if (paragraphChunk.length > 0) {
            currentChunk = paragraphChunk;
          }
        } else {
          // Only one paragraph but it's too long - split by characters
          for (let i = 0; i < section.length; i += MAX_CHUNK_SIZE) {
            chunks.push(section.substring(i, i + MAX_CHUNK_SIZE));
          }
        }
      } else {
        currentChunk = section;
      }
    } else {
      // This section fits in the current chunk
      currentChunk += section;
    }
  }

  // Add the last chunk if it has content
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  // As a final safeguard, ensure no chunk actually exceeds MAX_CHUNK_SIZE
  return chunks.map(chunk =>
    chunk.length > MAX_CHUNK_SIZE
      ? chunk.substring(0, MAX_CHUNK_SIZE)
      : chunk
  );
}
  
  // Core research functions adapted from the deep-research repo
  // =========================================================
  
  async function generateSerpQueries({
    query,
    numQueries = 3,
    learnings,
  }) {
    try {
      // Call Anthropic Claude API to generate search queries
      const response = await axios({
        method: 'post',
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        data: {
          model: 'claude-3-7-sonnet-20250219',
          max_tokens: 1000,
          temperature: 0.7,
          system: getSystemPrompt(),
          messages: [
            {
              role: 'user',
              content: `Given the following prompt from the user, generate a list of SERP queries to research the topic. Return a maximum of ${numQueries} queries, but feel free to return less if the original prompt is clear. Make sure each query is unique and not similar to each other: <prompt>${query}</prompt>\n\n${
                learnings
                  ? `Here are some learnings from previous research, use them to generate more specific queries: ${learnings.join(
                      '\n',
                    )}`
                  : ''
              }
              
              Your response should be in the following JSON format:
              {
                "queries": [
                  {
                    "query": "The SERP query",
                    "researchGoal": "First talk about the goal of this query, then go deeper into how to advance the research once results are found, mention additional research directions. Be specific."
                  },
                  ...
                ]
              }`
            }
          ]
        }
      });
  
      // Extract and parse the response
      const content = response.data.content[0].text;
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/({[\s\S]*})/);
      
      let parsedData;
      if (jsonMatch && jsonMatch[1]) {
        parsedData = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON without code blocks
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          parsedData = JSON.parse(content.substring(jsonStart, jsonEnd + 1));
        } else {
          throw new Error('Failed to parse JSON response');
        }
      }
      
      console.log(`Created ${parsedData.queries.length} queries`, parsedData.queries);
      return parsedData.queries.slice(0, numQueries);
    } catch (error) {
      console.error('Error generating SERP queries:', error);
      throw error;
    }
  }
  
  async function processSerpResult({
    query,
    result,
    numLearnings = 3,
    numFollowUpQuestions = 3,
  }) {
    try {
      const contents = result.data
        .filter(item => item.markdown)
        .map(item => trimContent(item.markdown, 25000));
      
      console.log(`Ran ${query}, found ${contents.length} contents`);
      
      if (contents.length === 0) {
        return {
          learnings: [],
          followUpQuestions: []
        };
      }
  
      // Call Anthropic API to process the search results
      const response = await axios({
        method: 'post',
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        data: {
          model: 'claude-3-7-sonnet-20250219',
          max_tokens: 1000,
          temperature: 0.7,
          system: getSystemPrompt(),
          messages: [
            {
              role: 'user',
              content: `Given the following contents from a SERP search for the query <query>${query}</query>, generate a list of learnings from the contents. Return a maximum of ${numLearnings} learnings, but feel free to return less if the contents are clear. Make sure each learning is unique and not similar to each other. The learnings should be concise and to the point, as detailed and information dense as possible. Make sure to include any entities like people, places, companies, products, things, etc in the learnings, as well as any exact metrics, numbers, or dates. The learnings will be used to research the topic further.\n\n<contents>${contents
                .map(content => `<content>\n${content}\n</content>`)
                .join('\n')}</contents>
                
                Your response should be in the following JSON format:
                {
                  "learnings": [
                    "First learning statement that is detailed and information-dense",
                    "Second learning statement with entities, metrics, or specific data points",
                    ...
                  ],
                  "followUpQuestions": [
                    "First follow-up question to pursue for further research",
                    "Second follow-up question focusing on a different aspect",
                    ...
                  ]
                }`
            }
          ]
        }
      });
  
      // Extract and parse the response
      const content = response.data.content[0].text;
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/({[\s\S]*})/);
      
      let parsedData;
      if (jsonMatch && jsonMatch[1]) {
        parsedData = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON without code blocks
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          parsedData = JSON.parse(content.substring(jsonStart, jsonEnd + 1));
        } else {
          throw new Error('Failed to parse JSON response');
        }
      }
      
      console.log(`Created ${parsedData.learnings.length} learnings`, parsedData.learnings);
      
      return {
        learnings: parsedData.learnings || [],
        followUpQuestions: parsedData.followUpQuestions || []
      };
    } catch (error) {
      console.error('Error processing SERP results:', error);
      return {
        learnings: [],
        followUpQuestions: []
      };
    }
  }
  
  async function writeFinalReport({
    prompt,
    learnings,
    visitedUrls,
  }) {
    try {
      const learningsString = trimContent(
        learnings
          .map(learning => `<learning>\n${learning}\n</learning>`)
          .join('\n'),
        150000
      );
  
      // Call Anthropic API to generate the final report
      const response = await axios({
        method: 'post',
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        data: {
          model: 'claude-3-7-sonnet-20250219',
          max_tokens: 4000,
          temperature: 0.7,
          system: getSystemPrompt(),
          messages: [
            {
              role: 'user',
              content: `Given the following prompt from the user, write a final report on the topic using the learnings from research. Make it as detailed as possible, aim for a comprehensive analysis, and include ALL the learnings from research:\n\n<prompt>${prompt}</prompt>\n\nHere are all the learnings from previous research:\n\n<learnings>\n${learningsString}\n</learnings>\n\nFormat the report with proper Markdown headings, sections, and bullet points. Include a title at the top.`
            }
          ]
        }
      });
  
      // Extract the report text
      const reportMarkdown = response.data.content[0].text;
      
      // Append the visited URLs section to the report
      const urlsSection = `\n\n## Sources\n\n${visitedUrls.map(url => `- ${url}`).join('\n')}`;
      return reportMarkdown + urlsSection;
    } catch (error) {
      console.error('Error generating final report:', error);
      throw error;
    }
  }
  
  async function deepResearch({
    query,
    breadth,
    depth,
    learnings = [],
    visitedUrls = [],
    onProgress,
  }) {
    const progress = {
      currentDepth: depth,
      totalDepth: depth,
      currentBreadth: breadth,
      totalBreadth: breadth,
      totalQueries: 0,
      completedQueries: 0,
    };
  
    const reportProgress = (update) => {
      Object.assign(progress, update);
      onProgress?.(progress);
    };
  
    try {
      const serpQueries = await generateSerpQueries({
        query,
        learnings,
        numQueries: breadth,
      });
  
      reportProgress({
        totalQueries: serpQueries.length,
        currentQuery: serpQueries[0]?.query,
      });
  
      // Process search queries sequentially with rate limit handling
      const results = [];
  
      for (let i = 0; i < serpQueries.length; i++) {
        const serpQuery = serpQueries[i];
        
        reportProgress({
          currentQuery: serpQuery.query,
          completedQueries: i
        });
  
        try {
          // Add a significant delay between queries to avoid rate limits
          // If this isn't the first query, wait before proceeding
          if (i > 0) {
            const delayMs = 5000 + (Math.random() * 2000); // 5-7 second random delay
            const message = `Waiting ${Math.round(delayMs/1000)} seconds before next query to avoid rate limits...`;
            console.log(message);
            
            reportProgress({
              rateLimit: message
            });
            
            await delay(delayMs);
          }
  
          // Try to execute the search with exponential backoff for rate limits
          let attempt = 0;
          let result;
          
          while (attempt < 5) { // Maximum 5 attempts
            try {
              result = await firecrawl.search(serpQuery.query, {
                timeout: 30000, // Increased timeout to 30 seconds
                limit: 5,
                scrapeOptions: { formats: ['markdown'] },
              });
              break; // Success, exit the retry loop
            } catch (error) {
              // Check if it's a rate limit error
              if (error.statusCode === 429) {
                attempt++;
                
                // Calculate exponential backoff time (3^attempt seconds + random jitter)
                const backoffTime = (Math.pow(3, attempt) * 1000) + (Math.random() * 2000);
                
                const message = `Rate limit hit for query: ${serpQuery.query}. Attempt ${attempt}/5. Backing off for ${Math.round(backoffTime/1000)} seconds.`;
                console.log(message);
                
                reportProgress({
                  rateLimit: message
                });
                
                await delay(backoffTime);
              } else {
                // Not a rate limit error, rethrow
                throw error;
              }
            }
          }
          
          // If we exited the loop without a result after all attempts, throw an error
          if (!result) {
            throw new Error(`Failed to complete search after multiple attempts due to rate limits: ${serpQuery.query}`);
          }
  
          // Collect URLs from this search
          const newUrls = result.data
            .filter(item => item.url)
            .map(item => item.url);
            
          const newBreadth = Math.ceil(breadth / 2);
          const newDepth = depth - 1;
  
          // Process results with a delay to avoid rate limits on Anthropic API
          const processingMessage = `Processing results for: ${serpQuery.query}`;
          console.log(processingMessage);
          reportProgress({
            rateLimit: processingMessage
          });
          await delay(2000);
  
          const newLearnings = await processSerpResult({
            query: serpQuery.query,
            result,
            numFollowUpQuestions: newBreadth,
          });
          
          const allLearnings = [...learnings, ...newLearnings.learnings];
          const allUrls = [...visitedUrls, ...newUrls];
  
          if (newDepth > 0) {
            console.log(
              `Researching deeper, breadth: ${newBreadth}, depth: ${newDepth}`,
            );
  
            reportProgress({
              currentDepth: newDepth,
              currentBreadth: newBreadth,
              completedQueries: progress.completedQueries + 1,
              currentQuery: serpQuery.query,
            });
  
            const nextQuery = `
              Previous research goal: ${serpQuery.researchGoal}
              Follow-up research directions: ${newLearnings.followUpQuestions.map(q => `\n${q}`).join('')}
            `.trim();
  
            // Add a significant delay before starting the next depth level
            const depthMessage = `Preparing for next depth level...`;
            console.log(depthMessage);
            reportProgress({
              rateLimit: depthMessage
            });
            await delay(5000);
  
            const deeperResult = await deepResearch({
              query: nextQuery,
              breadth: newBreadth,
              depth: newDepth,
              learnings: allLearnings,
              visitedUrls: allUrls,
              onProgress,
            });
            
            results.push(deeperResult);
          } else {
            reportProgress({
              currentDepth: 0,
              completedQueries: progress.completedQueries + 1,
              currentQuery: serpQuery.query,
            });
            
            results.push({
              learnings: allLearnings,
              visitedUrls: allUrls,
            });
          }
        } catch (e) {
          console.error(`Error running query: ${serpQuery.query}:`, e);
          
          const errorMessage = `Error with query: ${serpQuery.query}. Continuing with next query...`;
          console.log(errorMessage);
          reportProgress({
            rateLimit: errorMessage
          });
          
          await delay(3000); // Give a moment to see the error message
          
          // Still add any existing learnings and URLs even if this query failed
          results.push({
            learnings: learnings,
            visitedUrls: visitedUrls,
          });
        }
      }
  
      // Combine all results
      const combinedLearnings = [...new Set(results.flatMap(r => r.learnings))];
      const combinedUrls = [...new Set(results.flatMap(r => r.visitedUrls))];
      
      return {
        learnings: combinedLearnings,
        visitedUrls: combinedUrls,
      };
    } catch (error) {
      console.error('Error in deep research:', error);
      return {
        learnings: learnings,
        visitedUrls: visitedUrls,
      };
    }
  }
  
  // Helper function to update progress during rate limit waits
  async function updateProgress(progress, message) {
    if (progress.onProgress) {
      await progress.onProgress({
        ...progress,
        rateLimit: message
      });
    } else {
      console.log(message);
    }
  }
  
  // Utility functions
  function getSystemPrompt() {
    const now = new Date().toISOString();
    return `You are an expert researcher. Today is ${now}. Follow these instructions when responding:
    - You may be asked to research subjects that is after your knowledge cutoff, assume the user is right when presented with news.
    - The user is a highly experienced analyst, no need to simplify it, be as detailed as possible and make sure your response is correct.
    - Be highly organized.
    - Suggest solutions that I didn't think about.
    - Be proactive and anticipate my needs.
    - Treat me as an expert in all subject matter.
    - Mistakes erode my trust, so be accurate and thorough.
    - Provide detailed explanations, I'm comfortable with lots of detail.
    - Value good arguments over authorities, the source is irrelevant.
    - Consider new technologies and contrarian ideas, not just the conventional wisdom.
    - You may use high levels of speculation or prediction, just flag it for me.`;
  }
  
  function trimContent(content, maxLength = 25000) {
    if (!content) {
      return '';
    }
  
    if (content.length <= maxLength) {
      return content;
    }
  
    // Simple approach: just cut at the maxLength
    return content.substring(0, maxLength);
  }