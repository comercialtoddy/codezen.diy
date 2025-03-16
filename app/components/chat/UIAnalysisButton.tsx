import React, { useState } from 'react';
import { toast } from 'react-toastify';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ProviderInfo } from '~/types/model';

interface UIAnalysisButtonProps {
  imageData: string;
  model: string;
  provider: ProviderInfo;
  disabled?: boolean;
  onAnalysisComplete: (prompt: string) => void;
}

const uiAnalysisButton: React.FC<UIAnalysisButtonProps> = ({
  imageData,
  model,
  provider,
  disabled = false,
  onAnalysisComplete,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeUI = async () => {
    if (!imageData || disabled || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);

    const toastId = toast.info(
      <div>
        <div className="font-bold">Analyzing UI/UX...</div>
        <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">This may take a while.</div>
      </div>,
      { autoClose: false },
    );

    try {
      // Clear the current input and notify the start of the process
      onAnalysisComplete('');

      // Small delay to ensure the UI updates
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Initial text to inform the user
      onAnalysisComplete('Generating UI/UX analysis in up to 1 minute...');

      // Prepare the data for sending
      const formData = new FormData();
      formData.append('imageData', imageData);
      formData.append('model', model);
      formData.append('provider', JSON.stringify(provider));

      console.log(`Sending request for UI analysis with model: ${model}`);

      // Approach 1: Using EventSource to process SSE natively
      try {
        // First, we try the native SSE approach (more reliable for streaming)
        await processWithEventSource(formData, onAnalysisComplete, toastId.toString());
      } catch (eventSourceError) {
        console.warn('Failed to process with EventSource, trying alternative method:', eventSourceError);
        // If it fails, we try the fetch approach
        await processWithFetch(formData, onAnalysisComplete, toastId.toString());
      }
    } catch (error) {
      console.error('Error in UI analysis:', error);
      // Inserts an error message in the input
      onAnalysisComplete('Error in interface analysis. Please try again.');

      toast.update(toastId, {
        render: (
          <div>
            <div className="font-bold">Analysis error</div>
            <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">
              {error instanceof Error ? error.message : 'An unknown error occurred'}
            </div>
          </div>
        ),
        type: 'error',
        autoClose: 5000,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Define interface for the API response
  interface AnalysisResponse {
    status: string;
    id: string;
  }

  // Function to process using EventSource (better for SSE)
  const processWithEventSource = (formData: FormData, onAnalysisComplete: (text: string) => void, toastId: string) => {
    return new Promise((resolve, reject) => {
      // We create a temporary proxy endpoint due to EventSource limitations
      const uniqueId = Date.now().toString();
      const url = `/api/ui-analysis?id=${uniqueId}`;

      console.log('Starting UI analysis with ID:', uniqueId);

      // We send the data first with the ID in the URL to associate with the cache
      fetch(`/api/ui-analysis?id=${uniqueId}`, {
        method: 'POST',
        body: formData,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Error in server response: ${response.status} ${response.statusText}`);
          }

          // We wait for the JSON response to confirm that processing has started
          return response.json() as Promise<AnalysisResponse>;
        })
        .then((_data) => {
          if (!_data || !_data.status || _data.status !== 'processing') {
            throw new Error('Invalid server response during analysis initialization');
          }

          console.log('Processing started on the server, ID:', _data.id);

          /*
           * We increase the delay to ensure that the cache is ready on the server
           * The server now processes the stream in the background, so we need to wait longer
           */
          return new Promise<AnalysisResponse>((resolve) => setTimeout(() => resolve(_data), 1500));
        })
        .then((_data) => {
          /*
           * If the fetch is successful and the server responds with status "processing",
           * we can now create the EventSource
           */
          console.log('Starting EventSource to receive the data...');

          // We create the EventSource with automatic retry
          const eventSource = new EventSource(url);
          let result = '';
          let retryCount = 0;
          const maxRetries = 3;

          // We define a timeout to ensure we don't wait indefinitely
          const timeoutId = setTimeout(() => {
            console.warn('Timeout while waiting for EventSource data');
            eventSource.close();

            // If we already have some result, we use it even if it's incomplete
            if (result && result.trim() !== '') {
              console.log('Using partial result obtained so far');
              onAnalysisComplete(result);
              resolve('partial-success');
            } else {
              // Otherwise, we try the alternative method
              reject(new Error('Timeout while waiting for EventSource data'));
            }
          }, 30000); // 30 seconds timeout

          eventSource.onmessage = (event) => {
            // Clear the timeout with each received message
            clearTimeout(timeoutId);

            console.log('SSE event received:', event.data.substring(0, 50) + '...');

            if (event.data === '[DONE]') {
              console.log('Stream completed successfully');
              eventSource.close();
              clearTimeout(timeoutId);

              // Check if we obtained any text
              if (!result || result.trim() === '') {
                eventSource.close();
                reject(new Error('No text was generated by the analysis'));

                return;
              }

              // Check if the result contains the expected tags before updating
              const containsStructure =
                result.includes('<summary_title>') &&
                result.includes('<image_analysis>') &&
                result.includes('<development_planning>') &&
                result.includes('<implementation_requirements>');

              // Update the text in the input incrementally
              if (containsStructure) {
                onAnalysisComplete(result);
              } else if (result.trim() !== '') {
                /*
                 * If we still don't have the complete structure, we continue showing the processing message
                 * but add the incoming text to provide visual feedback
                 */
                onAnalysisComplete('Generating UI/UX interface analysis...\n\n' + result);
              }

              toast.update(toastId, {
                render: (
                  <div>
                    <div className="font-bold">Analysis completed!</div>
                    <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">
                      Prompt structured generated successfully.
                    </div>
                  </div>
                ),
                type: 'success',
                autoClose: 2000,
              });

              resolve('success');

              return;
            }

            try {
              // Accumulate the result
              result += event.data;

              // Check if the result contains the expected tags before updating
              const containsStructure =
                result.includes('<summary_title>') &&
                result.includes('<image_analysis>') &&
                result.includes('<development_planning>') &&
                result.includes('<implementation_requirements>');

              // Update the text in the input incrementally
              if (containsStructure) {
                onAnalysisComplete(result);
              } else if (result.trim() !== '') {
                // If we still don't have the complete structure, we continue showing the processing message
                onAnalysisComplete('Generating UI/UX interface analysis...\n\n' + result);
              }
            } catch (e) {
              console.error('Error processing event:', e);
              eventSource.close();
              clearTimeout(timeoutId);
              reject(e);
            }
          };

          eventSource.onerror = (error) => {
            console.error('Error in EventSource:', error);

            // We implement a retry logic
            retryCount++;

            if (retryCount <= maxRetries) {
              console.log(`Attempt ${retryCount}/${maxRetries} to reconnect...`);
              // EventSource tries to reconnect automatically
              return;
            }

            // If the number of retries is exceeded, we close the connection
            eventSource.close();
            clearTimeout(timeoutId);

            // If we already have some result, we use it even if it's incomplete
            if (result && result.trim() !== '') {
              console.log('Using partial result obtained so far');
              onAnalysisComplete(result);
              resolve('partial-success');
            } else {
              reject(error);
            }
          };
        })
        .catch((error) => {
          console.error('Error setting up EventSource:', error);
          reject(error);
        });
    });
  };

  // Function to process using traditional fetch (fallback)
  const processWithFetch = async (
    formData: FormData,
    onAnalysisComplete: (text: string) => void,
    toastId: string,
  ): Promise<void> => {
    // Attempt with traditional fetch
    const response = await fetch('/api/ui-analysis', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Error in server response: ${response.status} ${response.statusText}`);
    }

    console.log('Response received, processing complete text');

    // Get the full text of the response
    const text = await response.text();
    console.log('Full response received, size:', text.length);
    console.log('Sample of the response:', text.substring(0, 200));

    // Process the received SSE text to extract the data
    const lines = text.split('\n');
    let result = '';

    console.log(`Processing ${lines.length} response lines`);

    // Process line by line to extract the data from the SSE format
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.substring(6); // Remove 'data: '

        if (data === '[DONE]') {
          continue;
        }

        try {
          result += data;

          // Check if the result contains the expected tags before updating
          const containsStructure =
            result.includes('<summary_title>') &&
            result.includes('<image_analysis>') &&
            result.includes('<development_planning>') &&
            result.includes('<implementation_requirements>');

          // Update the text in the input incrementally
          if (containsStructure) {
            onAnalysisComplete(result);
          } else if (result.trim() !== '') {
            // If we still don't have the complete structure, we continue showing the processing message
            onAnalysisComplete('Generating UI/UX interface analysis...\n\n' + result);
          }
        } catch (e) {
          console.error('Error processing line:', e);
        }
      }
    }

    // If we don't have results yet, check if the raw text contains the expected format
    if (!result || result.trim() === '') {
      console.log('Trying to extract text from raw response...');

      // If the text contains the expected format, use it directly
      if (
        text.includes('<summary_title>') ||
        text.includes('<image_analysis>') ||
        text.includes('<development_planning>') ||
        text.includes('<implementation_requirements>')
      ) {
        result = text;
        onAnalysisComplete(result);
      } else {
        throw new Error('No text was generated by the analysis');
      }
    }

    // Completion
    console.log('Analysis successfully completed, result size:', result.length);

    toast.update(toastId, {
      render: (
        <div>
          <div className="font-bold">Analysis completed!</div>
          <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">
            Prompt structured generated successfully.
          </div>
        </div>
      ),
      type: 'success',
      autoClose: 2000,
    });
  };

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={analyzeUI}
          disabled={disabled || isAnalyzing}
          className={`absolute top-0 left-0 z-10 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-700 
                      rounded-bl-md rounded-tr-md p-1 shadow-md transition-colors flex items-center justify-center
                      ${isAnalyzing ? 'cursor-wait' : 'cursor-pointer'}
                      animate-pulse-slow border border-indigo-500`}
        >
          {isAnalyzing ? (
            <div className="i-svg-spinners:90-ring-with-bg text-white text-sm animate-spin"></div>
          ) : (
            <div className="i-ph:magic-wand text-white text-sm"></div>
          )}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary p-2 rounded-md text-xs border border-bolt-elements-borderColor max-w-[200px] z-50"
          sideOffset={5}
        >
          <p className="font-semibold">Analyze UI/UX</p>
          <div className="text-bolt-elements-textSecondary mt-1">
            Generates a structured prompt based on the interface image
          </div>
          <Tooltip.Arrow className="fill-bolt-elements-background-depth-3" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
};

export default uiAnalysisButton;
