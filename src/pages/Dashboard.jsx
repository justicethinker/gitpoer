import React from 'react';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="bg-surface text-on-surface font-body antialiased min-h-screen">
      {/* TopNavBar */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-surface/80 backdrop-blur-md z-50 flex items-center justify-between px-8 border-b border-outline-variant/20">
        <div className="flex items-center gap-4">
          <span className="font-headline text-xl font-bold tracking-tighter cursor-pointer" onClick={() => navigate('/')}>README.gen</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-on-surface-variant font-label text-sm uppercase tracking-widest">Developer Mode</span>
            <div className="w-8 h-8 bg-surface-container-highest flex items-center justify-center overflow-hidden">
              <img 
                alt="User Profile" 
                className="w-full h-full object-cover grayscale" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCQwnox85CMVa6-jGnq0zawTQ5yuKS_1yL6r0btU7lkOaRIILirYSoOEE7Yhk-aSUIqaaKw3Isa12BmwfbQ8rG_Axqw0W-7SHnx8Tz4JgSlMnLiZEM7MCBUKkOPbBIQq4b3hbMZYRw_rG8qyVHrLLGqD68sa5OZ6tU43zsxenVRf4veBl6_usyIh3wnBsbUrZ6hxO4KO2NDOsud-XuwCol4FaXHZLuyKwvYfAI5ipjVeRIs2JyxvKKl7L3j5WkT7S2juAVyTnNt28CF"
              />
            </div>
          </div>
        </div>
      </nav>

      {/* SideNavBar */}
      <aside className="fixed left-0 top-16 bottom-0 w-64 bg-surface-container-low border-r border-outline-variant/10 p-6 hidden lg:flex flex-col">
        <div className="mb-12">
          <h1 className="font-headline text-lg font-bold">README.gen</h1>
          <p className="font-label text-xs text-on-surface-variant tracking-tight">GitHub Repo Generator</p>
        </div>
        <nav className="flex-1 space-y-2">
          <button className="w-full group flex items-center gap-3 px-4 py-3 bg-black text-white transition-all">
            <span className="material-symbols-outlined text-xl">folder</span>
            <span className="font-label text-sm font-medium">My Projects</span>
          </button>
          <button className="w-full group flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-all">
            <span className="material-symbols-outlined text-xl">description</span>
            <span className="font-label text-sm font-medium">Templates</span>
          </button>
          <button className="w-full group flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-all">
            <span className="material-symbols-outlined text-xl">settings</span>
            <span className="font-label text-sm font-medium">Settings</span>
          </button>
          <button className="w-full group flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-all">
            <span className="material-symbols-outlined text-xl">help</span>
            <span className="font-label text-sm font-medium">Support</span>
          </button>
        </nav>
        <div className="mt-auto">
          <button className="w-full bg-black text-white py-4 font-label text-xs uppercase tracking-widest hover:bg-zinc-800 transition-colors">
            Create New README
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 min-h-screen">
        <div className="p-8 lg:p-12 max-w-7xl mx-auto space-y-12">
          <header className="space-y-2">
            <h2 className="font-headline text-5xl font-bold tracking-tighter leading-none">Welcome back, Developer</h2>
            <p className="text-on-surface-variant max-w-lg font-label text-sm uppercase tracking-wider">Engineered documentation for high-performance repositories.</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            {/* Create New Project Card */}
            <div className="md:col-span-4 aspect-square bg-surface-container-lowest flex flex-col items-center justify-center group cursor-pointer hover:-translate-y-1 transition-transform border border-transparent hover:border-black/5">
              <div className="w-16 h-16 border border-outline-variant flex items-center justify-center mb-6 group-hover:bg-black group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-3xl">add</span>
              </div>
              <span className="font-label text-xs uppercase tracking-[0.2em] font-bold">Create New Project</span>
            </div>

            {/* Usage Stats */}
            <div className="md:col-span-4 bg-surface-container-low p-8 flex flex-col justify-between">
              <div>
                <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-8 block">Analytics Overview</span>
                <div className="space-y-8">
                  <div>
                    <div className="text-4xl font-headline font-bold">12</div>
                    <div className="font-label text-xs text-on-surface-variant uppercase tracking-tighter">READMEs generated</div>
                  </div>
                  <div>
                    <div className="text-4xl font-headline font-bold">03</div>
                    <div className="font-label text-xs text-on-surface-variant uppercase tracking-tighter">connected repos</div>
                  </div>
                </div>
              </div>
              <div className="mt-8 pt-4 border-t border-outline-variant/20">
                <span className="font-label text-[10px] text-on-surface-variant uppercase italic">System performing at peak capacity</span>
              </div>
            </div>

            {/* Active Blueprint */}
            <div className="md:col-span-4 bg-black text-white p-8 flex flex-col justify-between overflow-hidden relative">
              <div className="z-10">
                <span className="font-label text-[10px] uppercase tracking-widest text-white/60 mb-8 block">Active Blueprint</span>
                <h3 className="font-headline text-2xl font-bold mb-2">Modern Brutalist</h3>
                <p className="text-white/70 font-label text-xs">A high-contrast, documentation-first style with zero-radius components.</p>
              </div>
              <div className="z-10 mt-8">
                <button className="border border-white/30 px-6 py-2 font-label text-[10px] uppercase tracking-widest hover:bg-white hover:text-black transition-all">Change Template</button>
              </div>
              <div className="absolute -right-8 -bottom-8 opacity-10">
                <span className="material-symbols-outlined text-[160px]">architecture</span>
              </div>
            </div>

            {/* Recent READMEs List */}
            <div className="md:col-span-12 space-y-6 pt-8">
              <div className="flex items-end justify-between border-b border-black/10 pb-4">
                <h4 className="font-headline text-xl font-bold">Recent READMEs</h4>
                <button className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-black transition-colors underline underline-offset-4">View All Repositories</button>
              </div>
              <div className="space-y-1">
                {[
                  { name: 'awesome-python-tool', tag: 'Open Source', version: 'v1.2.0', time: '2 hours ago' },
                  { name: 'academic-research-paper', tag: 'Academic', version: 'LaTeX Sync', time: '1 day ago' },
                  { name: 'neural-net-visualizer', tag: 'Machine Learning', version: 'Draft', time: '3 days ago' }
                ].map((item, idx) => (
                  <div key={idx} className="group flex flex-col md:flex-row md:items-center justify-between p-6 bg-surface-container-lowest hover:bg-surface-container-high transition-colors">
                    <div className="flex flex-col gap-1">
                      <span className="font-headline text-lg font-semibold tracking-tight">{item.name}</span>
                      <div className="flex gap-2">
                        <span className="bg-secondary-container text-on-secondary-container px-2 py-0.5 font-label text-[10px] uppercase">{item.tag}</span>
                        <span className="bg-surface-container-highest text-on-surface-variant px-2 py-0.5 font-label text-[10px] uppercase">{item.version}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-12 mt-4 md:mt-0">
                      <div className="text-right">
                        <div className="font-label text-[10px] uppercase text-on-surface-variant tracking-widest">Last edited</div>
                        <div className="font-label text-sm font-medium">{item.time}</div>
                      </div>
                      <button className="w-10 h-10 border border-outline-variant/30 flex items-center justify-center hover:bg-black hover:text-white transition-all">
                        <span className="material-symbols-outlined text-xl">edit</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Status Bar */}
      <footer className="lg:pl-64 border-t border-outline-variant/10 bg-surface">
        <div className="px-8 py-4 flex items-center justify-between text-[10px] font-label uppercase tracking-[0.2em] text-on-surface-variant">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-black"></span> System Online</span>
            <span className="opacity-40">|</span>
            <span>Version 2.4.0-Stable</span>
          </div>
          <div>
            © 2024 README.gen Architectural Systems
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;