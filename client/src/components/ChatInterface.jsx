import { useState } from 'react';
import { Send, Loader } from 'lucide-react';

export default function ChatInterface({ onQuery }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      // Call backend API
      const response = await fetch('http://localhost:8000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: input })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();

      const assistantMessage = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources || [],
        relationships: data.relationships || [],
        graph_nodes: data.graph_nodes || []
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Notify parent to highlight nodes in graph
      if (onQuery && data.graph_nodes && data.graph_nodes.length > 0) {
        onQuery(data.graph_nodes);
      }
    } catch (err) {
      console.error('Query failed:', err);
      setError(err.message || 'Failed to process your question');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${err.message || 'Unknown error'}`,
        error: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-gray-800 dark:to-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="text-xl">💬</span> Ask About the Contract
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          I'll analyze the graph and answer your questions
        </p>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            <p className="text-lg font-medium mb-4">Ask me anything about the contract:</p>
            <div className="space-y-2 text-sm bg-blue-50 dark:bg-blue-950 rounded-lg p-4 inline-block">
              <p className="text-gray-700 dark:text-gray-300">• "Are there any contradictions?"</p>
              <p className="text-gray-700 dark:text-gray-300">• "What are the consultant's obligations?"</p>
              <p className="text-gray-700 dark:text-gray-300">• "Who are the parties?"</p>
              <p className="text-gray-700 dark:text-gray-300">• "When does this agreement expire?"</p>
              <p className="text-gray-700 dark:text-gray-300">• "What are the payment terms?"</p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-4 ${
                msg.role === 'user'
                  ? 'bg-teal-600 text-white rounded-br-none'
                  : msg.error
                  ? 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 rounded-bl-none'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-none'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>

              {/* Show sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
                  <p className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">📌 Sources:</p>
                  <div className="space-y-1">
                    {msg.sources.slice(0, 4).map((source, i) => (
                      <div key={i} className="text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-700 rounded px-2 py-1">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{source.name}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {' '}[{source.type}]
                        </span>
                      </div>
                    ))}
                    {msg.sources.length > 4 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                        +{msg.sources.length - 4} more sources
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Show relationships if available */}
              {msg.relationships && msg.relationships.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                  <p className="text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">🔗 Relationships:</p>
                  <div className="space-y-1">
                    {msg.relationships.slice(0, 2).map((rel, i) => (
                      <div key={i} className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{rel.from_name}</span>
                        <span className="text-teal-600 dark:text-teal-400 mx-1">→</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{rel.to_name}</span>
                        {rel.reason && (
                          <span className="text-gray-500 dark:text-gray-500">: {rel.reason}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg rounded-bl-none p-4 flex items-center gap-2">
              <Loader className="w-4 h-4 animate-spin text-teal-600" />
              <span className="text-sm text-gray-600 dark:text-gray-400">Analyzing your question...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center text-red-600 dark:text-red-400 text-sm py-2">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about the contract... (Shift+Enter for new line)"
            rows="2"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-white resize-none"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-w-fit"
          >
            {loading ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          💡 Tip: Ask specific questions for better answers. Graph data is integrated for context.
        </p>
      </div>
    </div>
  );
}
