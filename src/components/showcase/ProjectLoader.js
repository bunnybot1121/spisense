export const projects = [
  {
    id: 'bupi',
    title: 'BUPI',
    subtitle: 'AI Desktop Companion',
    color: '#ffcc00', // Yellow
    description: 'An intelligent desktop buddy with customized personality that lives on your screen, automates tasks, monitors system health, and keeps you company.',
    tech: ['React', 'Electron', 'Python', 'OpenAI API', 'Node.js', 'Tailwind CSS'],
    poster: '/src/assets/bupi.jpg',
    triggerPos: { x: 0, y: 0.05, z: 35 },
    rotationY: 0,
    features: [
      'Smart Conversations with memory and context awareness',
      'Task Automation (automate desktop actions, apps, workflows)',
      'System Monitoring (real-time CPU, RAM, and temperature stats)',
      'Smart Reminders & context-aware notifications'
    ],
    qrCode: 'https://github.com/Sachin/bupi'
  },
  {
    id: 'sirg_glider',
    title: 'SIRG GLIDER',
    subtitle: 'RC Glider with Telemetry',
    color: '#00f3ff', // Cyan
    description: 'A micro-aerial vehicle showcasing long-range telemetry, autonomous flight control, and live 3D web-based telemetry dashboard tracking.',
    tech: ['Arduino', 'C++', 'ESP32', 'React', 'Three.js', 'WebSockets'],
    poster: '/src/assets/bupi.jpg', // fallback or sirg.jpg if available
    triggerPos: { x: -25, y: 15.0, z: -10 },
    rotationY: 45,
    features: [
      'Real-time Telemetry stream over RF link (915MHz Lora)',
      'Live GPS Tracking and 3D path reconstruction in WebGL',
      'Autonomous Stabilisation and navigation mode',
      'Long-Range Control system overrides'
    ],
    qrCode: 'https://github.com/Sachin/sirg-glider'
  },
  {
    id: 'nagarsevak_ai',
    title: 'NAGARSEVAK AI',
    subtitle: 'AI Municipal Maintenance Scheduler',
    color: '#00ff88', // Green
    description: 'Predictive dispatching and repair crew scheduling system for urban departments, automating issue triage and complaint priority mapping.',
    tech: ['Python', 'PyTorch', 'React', 'Node.js', 'PostgreSQL', 'Leaflet'],
    poster: '/src/assets/bupi.jpg', // fallback or nagarsevak.jpg if available
    triggerPos: { x: 25, y: 18.0, z: 15 },
    rotationY: -45,
    features: [
      'Smart Complaint Management (NLP triage of text reports)',
      'AI-Based Prioritization based on severity and location',
      'Crew Route Optimization and maintenance scheduling',
      'City Analytics Dashboard for urban planners'
    ],
    qrCode: 'https://github.com/Sachin/nagarsevak-ai'
  },
  {
    id: 'place_for_us',
    title: 'PLACE FOR US',
    subtitle: 'Couple Game Hub',
    color: '#ff00aa', // Pink
    description: 'A co-op progressive gaming hub designed for couples, featuring interactive memory journals, co-op challenge streaks, and mini-games.',
    tech: ['React', 'Vite', 'PWA', 'Supabase', 'Tailwind CSS', 'Framer Motion'],
    poster: '/src/assets/bupi.jpg', // fallback or placeforus.jpg if available
    triggerPos: { x: -35, y: 0.05, z: 10 },
    rotationY: 90,
    features: [
      'Progressive Couple Games and trivia challenges',
      'Shared Memory Journal with photo uploads and reminders',
      'Co-op streaks and challenge streak badges',
      'Real-time database sync and notifications via Supabase'
    ],
    qrCode: 'https://github.com/Sachin/place-for-us'
  },
  {
    id: 'many_more',
    title: '+ MANY MORE',
    subtitle: 'Future Concepts',
    color: '#00ffff', // Cyan
    description: 'More innovative web applications, autonomous robotic prototypes, and intelligent AI agents are currently in research and active development.',
    tech: ['LLM Agents', 'PyTorch', 'ROS', 'Next.js', 'MQTT', 'TypeScript'],
    poster: '/src/assets/bupi.jpg', // fallback
    triggerPos: { x: 35, y: 0.05, z: 10 },
    rotationY: -90,
    features: [
      'Multi-agent LLM systems for engineering automation',
      'Robotics Operating System (ROS) integration testbeds',
      'Real-time IoT sensors and telemetry streaming hubs',
      'Edge computing deployments for AI models'
    ],
    qrCode: 'https://github.com/Sachin/future-projects'
  }
];
