import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { callAI } from '../utils/ai';
import OutputBox from '../components/shared/OutputBox';

export default function IssueTemplates() {
  const { owner, repo } = useParams();
  const { state, incrementGeneration } = useApp();
  const { generationsUsed = 0, generationsLimit = 5, apiKey } = state || {};
  
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateTemplates = async () => {
    if (generationsUsed >= generationsLimit) {
      setError('Generation limit reached. Please upgrade your plan.');
      return;
    }

    setLoading(true);
    setError('');
    setOutput('');

    try {
      const prompt = `You are an expert open-source maintainer. Write standard GitHub Issue Templates for the repository ${owner}/${repo}. 
Create three templates: 
1. Bug Report
2. Feature Request
3. Custom Issue

Format them as a single markdown document with headings. Include all the standard fields like Description, Expected Behavior, Actual Behavior, Steps to Reproduce, Environment, etc.`;

      const result = await callAI(prompt, apiKey);
      setOutput(result);
      incrementGeneration();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f0f6fc', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 32 }}>ðŸ ›ï¸ </span> Issue Templates
        </h1>
        <p style={{ fontSize: 15, color: '#8b949e' }}>
          Generate standard GitHub Issue templates (Bug Report, Feature Request) tailored for <strong>{owner}/{repo}</strong>.
        </p>
      </div>

      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 24, marginBottom: 32 }}>
        <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 16 }}>
          This will generate a ready-to-use markdown file that you can place in your <code>.github/ISSUE_TEMPLATE</code> folder.
        </p>
        <button 
          onClick={generateTemplates}
          disabled={loading || generationsUsed >= generationsLimit}
          className="btn-primary"
          style={{ padding: '12px 24px', fontSize: 15 }}
        >
          {loading ? 'Generating...' : 'Generate Templates'}
        </button>
        {error && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 12 }}>{error}</div>}
      </div>

      {output && (
        <OutputBox content={output} filename="ISSUE_TEMPLATES.md" accentColor="#3b82f6" />
      )}
    </div>
  );
}
