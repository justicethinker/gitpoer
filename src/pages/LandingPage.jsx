import React from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen">
      {/* TopNavBar */}
      <nav className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-outline-variant/20 h-20 flex items-center">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary text-xl">terminal</span>
            </div>
            <span className="font-headline font-bold text-xl tracking-tight">README.gen</span>
          </div>
          <div className="hidden md:flex items-center gap-12">
            <button className="text-sm font-medium hover:text-primary transition-colors">Features</button>
            <button className="text-sm font-medium hover:text-primary transition-colors">Templates</button>
            <button className="text-sm font-medium hover:text-primary transition-colors">GitHub</button>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => navigate('/dashboard')}
              className="bg-black text-white px-6 py-3 text-sm font-medium hover:bg-zinc-800 transition-all rounded-none"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* HeroSection */}
      <section className="relative min-h-[80vh] flex items-center overflow-hidden bg-surface">
        <div className="container mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center py-24">
          <div className="z-10">
            <div className="inline-flex items-center gap-2 bg-secondary-container px-3 py-1 mb-8">
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-secondary-container">Documentation Engine v2.0</span>
            </div>
            <h1 className="font-headline text-6xl md:text-7xl font-bold leading-[1.05] tracking-tighter mb-8 text-on-surface">
              Professional READMEs for every project.
            </h1>
            <p className="text-lg text-on-surface-variant max-w-xl mb-12 leading-relaxed">
              Generate audience-specific documentation for Hackathons, Academic research, and Open Source projects in a clean monochrome style.
            </p>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={() => navigate('/dashboard')}
                className="bg-black text-white px-10 py-5 text-base font-semibold rounded-none flex items-center gap-3 hover:bg-zinc-800 transition-all"
              >
                Start Generating
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
              <button className="border border-outline-variant/40 hover:bg-surface-container-low px-10 py-5 text-base font-semibold rounded-none transition-colors">
                View Samples
              </button>
            </div>
          </div>
          <div className="relative">
            <div className="bg-surface-container-highest p-4 rounded-none border border-outline-variant/20 shadow-2xl shadow-black/5">
              <img 
                alt="Monochrome README interface preview" 
                className="w-full grayscale contrast-125 brightness-90" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCG3ERgnHDy6AeR_TWqX5QG8jrvDDVcT-2_LC31qpk6o5Lec-uRBHOcw_2Jesz7QNzeq28kmlIaxsYd0rK-XhOOqTdgROZKx4uqn7GkSzYpONyyshK6hQyAojvYqyvD1wN8vSQjjbBiUGsV0G1JGHcNVFM77Y7EULjKQ_-q5Mny2dYhjESn5AlPMGesNVEQLeQVC6u3FXCfNgh3Y3ZhIxSEUCKyxWjkWvwTZs0Uop-KOnB-88HW6-IJxC19CUSTpsBp7EuB6yQe146h"
              />
              <div className="mt-4 flex gap-2">
                <div className="w-2 h-2 bg-on-surface-variant/30"></div>
                <div className="w-2 h-2 bg-on-surface-variant/30"></div>
                <div className="w-2 h-2 bg-on-surface-variant/30"></div>
              </div>
            </div>
            <div className="absolute -bottom-10 -left-10 w-40 h-40 border-l-4 border-b-4 border-primary/10 -z-10"></div>
          </div>
        </div>
      </section>

      {/* FeatureSection */}
      <section className="py-32 bg-surface-container-low">
        <div className="container mx-auto px-6">
          <div className="mb-20">
            <h2 className="font-headline text-4xl font-bold tracking-tight mb-4">Tailored for your audience</h2>
            <p className="text-on-surface-variant max-w-lg">Choose the blueprint that fits your project goals. Each mode features unique logic and required sections.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
            {/* Card 1: Hackathon */}
            <div className="bg-surface-container-lowest p-10 flex flex-col justify-between group hover:bg-black hover:text-white transition-all duration-300 border border-outline-variant/10">
              <div>
                <div className="w-12 h-12 bg-surface-container flex items-center justify-center mb-8 group-hover:bg-zinc-800">
                  <span className="material-symbols-outlined text-primary group-hover:text-white text-3xl">terminal</span>
                </div>
                <h3 className="font-headline text-2xl font-bold mb-4">Hackathon</h3>
                <p className="text-on-surface-variant group-hover:text-white/80 leading-relaxed mb-8">
                  Optimized for quick judging with feature highlights and tech stack focus.
                </p>
              </div>
              <ul className="space-y-3 mb-8 opacity-60 group-hover:opacity-100">
                <li className="text-xs flex items-center gap-2"><span className="material-symbols-outlined text-sm">check</span> Visual Demo Link</li>
                <li className="text-xs flex items-center gap-2"><span className="material-symbols-outlined text-sm">check</span> Quick Installation</li>
                <li className="text-xs flex items-center gap-2"><span className="material-symbols-outlined text-sm">check</span> Tech Stack Badge</li>
              </ul>
            </div>
            {/* Card 2: Academic */}
            <div className="bg-surface-container-lowest p-10 flex flex-col justify-between group hover:bg-black hover:text-white transition-all duration-300 border border-outline-variant/10">
              <div>
                <div className="w-12 h-12 bg-surface-container flex items-center justify-center mb-8 group-hover:bg-zinc-800">
                  <span className="material-symbols-outlined text-primary group-hover:text-white text-3xl">school</span>
                </div>
                <h3 className="font-headline text-2xl font-bold mb-4">Academic</h3>
                <p className="text-on-surface-variant group-hover:text-white/80 leading-relaxed mb-8">
                  Standardized for research papers with citations and methodology sections.
                </p>
              </div>
              <ul className="space-y-3 mb-8 opacity-60 group-hover:opacity-100">
                <li className="text-xs flex items-center gap-2"><span className="material-symbols-outlined text-sm">check</span> BibTeX Citation</li>
                <li className="text-xs flex items-center gap-2"><span className="material-symbols-outlined text-sm">check</span> Dataset Specs</li>
                <li className="text-xs flex items-center gap-2"><span className="material-symbols-outlined text-sm">check</span> Reproducibility Guide</li>
              </ul>
            </div>
            {/* Card 3: Open Source */}
            <div className="bg-surface-container-lowest p-10 flex flex-col justify-between group hover:bg-black hover:text-white transition-all duration-300 border border-outline-variant/10">
              <div>
                <div className="w-12 h-12 bg-surface-container flex items-center justify-center mb-8 group-hover:bg-zinc-800">
                  <span className="material-symbols-outlined text-primary group-hover:text-white text-3xl">hub</span>
                </div>
                <h3 className="font-headline text-2xl font-bold mb-4">Open Source</h3>
                <p className="text-on-surface-variant group-hover:text-white/80 leading-relaxed mb-8">
                  Built for community growth with contribution guides and license clarity.
                </p>
              </div>
              <ul className="space-y-3 mb-8 opacity-60 group-hover:opacity-100">
                <li className="text-xs flex items-center gap-2"><span className="material-symbols-outlined text-sm">check</span> Contribution Workflow</li>
                <li className="text-xs flex items-center gap-2"><span className="material-symbols-outlined text-sm">check</span> Code of Conduct</li>
                <li className="text-xs flex items-center gap-2"><span className="material-symbols-outlined text-sm">check</span> Security Policy</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24 bg-surface border-y border-outline-variant/10">
        <div className="container mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
          <div>
            <div className="font-headline text-4xl font-bold mb-1">50k+</div>
            <div className="text-xs uppercase tracking-widest text-on-surface-variant font-semibold">READMEs Generated</div>
          </div>
          <div>
            <div className="font-headline text-4xl font-bold mb-1">100%</div>
            <div className="text-xs uppercase tracking-widest text-on-surface-variant font-semibold">Markdown Compatible</div>
          </div>
          <div>
            <div className="font-headline text-4xl font-bold mb-1">200+</div>
            <div className="text-xs uppercase tracking-widest text-on-surface-variant font-semibold">Custom Components</div>
          </div>
          <div>
            <div className="font-headline text-4xl font-bold mb-1">Free</div>
            <div className="text-xs uppercase tracking-widest text-on-surface-variant font-semibold">For Open Source</div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 container mx-auto px-6">
        <div className="bg-black p-16 md:p-24 flex flex-col md:flex-row justify-between items-center gap-12 rounded-none">
          <div className="max-w-2xl text-center md:text-left text-white">
            <h2 className="font-headline text-4xl md:text-5xl font-bold leading-tight mb-6">Ready to elevate your repository's first impression?</h2>
            <p className="text-white/70 text-lg">Stop wasting time on formatting. Let README.gen handle the documentation while you focus on the code.</p>
          </div>
          <div className="shrink-0">
            <button 
              onClick={() => navigate('/dashboard')}
              className="bg-white text-black px-12 py-6 text-lg font-bold hover:bg-zinc-200 transition-colors rounded-none"
            >
              Start Generating
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface border-t border-outline-variant/20 pt-24 pb-12">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-16 mb-24">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-2 mb-8">
                <div className="w-6 h-6 bg-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-primary text-xs">terminal</span>
                </div>
                <span className="font-headline font-bold tracking-tight">README.gen</span>
              </div>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                The definitive documentation tool for high-performance developer teams and researchers worldwide.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-6 text-sm uppercase tracking-widest">Product</h4>
              <ul className="space-y-4">
                <li><button className="text-sm text-on-surface-variant hover:text-primary transition-colors">Templates</button></li>
                <li><button className="text-sm text-on-surface-variant hover:text-primary transition-colors">Examples</button></li>
                <li><button className="text-sm text-on-surface-variant hover:text-primary transition-colors">Documentation</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6 text-sm uppercase tracking-widest">Company</h4>
              <ul className="space-y-4">
                <li><button className="text-sm text-on-surface-variant hover:text-primary transition-colors">About</button></li>
                <li><button className="text-sm text-on-surface-variant hover:text-primary transition-colors">Terms</button></li>
                <li><button className="text-sm text-on-surface-variant hover:text-primary transition-colors">Privacy</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6 text-sm uppercase tracking-widest">Support</h4>
              <ul className="space-y-4">
                <li><button className="text-sm text-on-surface-variant hover:text-primary transition-colors">GitHub Issues</button></li>
                <li><button className="text-sm text-on-surface-variant hover:text-primary transition-colors">Twitter</button></li>
                <li><button className="text-sm text-on-surface-variant hover:text-primary transition-colors">Discord</button></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center border-t border-outline-variant/10 pt-12">
            <p className="text-xs text-on-surface-variant mb-4 md:mb-0">© 2024 README.gen. Built for developers.</p>
            <div className="flex gap-8">
              <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">terminal</span>
              <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">code</span>
              <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">data_object</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;