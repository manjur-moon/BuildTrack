/** BUILDTRACK_MARKETING_V1 — public SaaS marketing page (no database or authentication writes). */
import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingReveal } from "@/components/marketing/marketing-reveal";
import "./home.css";

export const metadata: Metadata = {
  title: "BuildTrack — Build with clarity",
  description: "A clearer way to manage construction projects. Bring project planning, site execution, teams and financial visibility into one connected workspace.",
  openGraph: {
    title: "BuildTrack — Build with clarity",
    description: "Construction management, with every detail connected.",
    type: "website",
  },
};

const capabilities = [
  { id: "01", title: "Project command", label: "PLAN WITH PRECISION", body: "Create structure around projects, sites, milestones and the people responsible for moving work forward.", href: "#workflows" },
  { id: "02", title: "Site coordination", label: "STAY CLOSE TO THE WORK", body: "Connect the work happening on site with the decisions being made in the office.", href: "#workflows" },
  { id: "03", title: "People & resources", label: "KEEP EVERYONE ALIGNED", body: "A considered approach to workforce visibility, resource planning and accountability.", href: "#workflows" },
  { id: "04", title: "Cost awareness", label: "SEE THE BIGGER PICTURE", body: "Give project and finance teams a common context for costs, updates and delivery decisions.", href: "#approach" },
];

const questions = [
  { question: "What is BuildTrack designed for?", answer: "BuildTrack is a construction management software platform designed around the operational relationship between projects, sites, teams and financial oversight." },
  { question: "Is BuildTrack a construction company?", answer: "No. BuildTrack is software for construction teams. Architectural photography on this website illustrates the industry; it does not represent projects delivered by BuildTrack." },
  { question: "Can anyone create a workspace?", answer: "Access is controlled through organization invitations and assigned roles. If your team already uses BuildTrack, sign in with your authorized account." },
  { question: "Are all features available now?", answer: "The platform is being released in stages. Authentication and the dashboard foundation are in place; operational modules are being implemented and verified. This page communicates the product direction rather than promising that every module is already live." },
];

export default function Home() {
  return (
    <div className="bt-home" id="top">
      <a className="bt-home-skip" href="#main">Skip to main content</a>
      <MarketingHeader />
      <main id="main">
        <section className="bt-home-hero" aria-labelledby="bt-home-hero-title">
          <div className="bt-home-hero-visual" role="img" aria-label="Illustrative photograph of a contemporary architectural building" />
          <div className="bt-home-hero-grid" aria-hidden="true"><span/><span/><span/></div>
          <div className="bt-home-hero-content bt-home-wrap">
            <div className="bt-home-hero-eyebrow"><span className="bt-home-star" aria-hidden="true">✳</span> CONSTRUCTION, IN CONTROL <span className="bt-home-eyebrow-line"/></div>
            <h1 id="bt-home-hero-title">Build with<br/><em>clarity.</em></h1>
            <div className="bt-home-hero-bottom">
              <p>The bigger the build, the more every detail matters. One considered workspace for the work behind the work.</p>
              <div className="bt-home-hero-links">
                <Link href="/dashboard" className="bt-home-hero-primary">Open workspace <span aria-hidden="true">↗</span></Link>
                <a href="#platform" className="bt-home-text-link">Discover BuildTrack <span aria-hidden="true">↘</span></a>
              </div>
            </div>
            <div className="bt-home-hero-caption"><span>BUILT FOR THE COMPLEXITY OF CONSTRUCTION</span><span>01 — THE VISION</span></div>
          </div>
          <a href="#platform" className="bt-home-scroll-cue" aria-label="Scroll to platform overview"><span aria-hidden="true">↓</span></a>
        </section>

        <section className="bt-home-ticker" aria-label="BuildTrack perspective"><div className="bt-home-wrap bt-home-ticker-inner"><span>STRUCTURE</span><span className="bt-home-cross" aria-hidden="true">+</span><span>VISIBILITY</span><span className="bt-home-cross" aria-hidden="true">+</span><span>ACCOUNTABILITY</span><span className="bt-home-cross" aria-hidden="true">+</span><span>PROGRESS</span></div></section>

        <section className="bt-home-intro bt-home-section" id="platform" aria-labelledby="bt-home-intro-title">
          <div className="bt-home-wrap">
            <MarketingReveal className="bt-home-section-intro"><div className="bt-home-overline"><span>01 / THE PLATFORM</span><span className="bt-home-plus" aria-hidden="true">✳</span></div><div className="bt-home-intro-main"><h2 id="bt-home-intro-title">Every moving part.<br/><em>One clear picture.</em></h2><div className="bt-home-intro-copy"><p>Construction moves fast. Information should move with it.</p><p>BuildTrack is being shaped around a simple idea: connect the people, places and decisions that bring a project to life.</p><a href="#capabilities" className="bt-home-inline-link">See what connects <span aria-hidden="true">↗</span></a></div></div></MarketingReveal>
            <div className="bt-home-architectural-rule"><span>FROM FIRST PLAN TO FINAL HANDOVER</span><span>BT—01</span></div>
          </div>
        </section>

        <section className="bt-home-capabilities bt-home-section" id="capabilities" aria-labelledby="bt-home-capabilities-title">
          <div className="bt-home-wrap bt-home-capabilities-grid">
            <MarketingReveal className="bt-home-capabilities-left">
              <div className="bt-home-overline"><span>02 / WHAT CONNECTS</span><span className="bt-home-plus" aria-hidden="true">✳</span></div>
              <h2 id="bt-home-capabilities-title">More than<br/><em>moving parts.</em></h2>
              <p className="bt-home-capabilities-lead">A product direction built around the realities of construction teams—not disconnected spreadsheets.</p>
              <div className="bt-home-capabilities-visual" role="img" aria-label="Illustrative modern architectural interior" />
              <p className="bt-home-visual-footnote">ARCHITECTURAL PHOTOGRAPHY / ILLUSTRATIVE</p>
            </MarketingReveal>
            <div className="bt-home-capability-list">
              {capabilities.map((item) => <MarketingReveal key={item.id}><a href={item.href} className="bt-home-capability"><div className="bt-home-capability-heading"><span className="bt-home-capability-id">{item.id}</span><span className="bt-home-capability-title">{item.title}</span><span className="bt-home-capability-arrow" aria-hidden="true">↗</span></div><span className="bt-home-capability-label">{item.label}</span><p>{item.body}</p></a></MarketingReveal>)}
            </div>
          </div>
        </section>

        <section className="bt-home-workflows bt-home-section" id="workflows" aria-labelledby="bt-home-workflows-title">
          <div className="bt-home-wrap">
            <MarketingReveal><div className="bt-home-overline"><span>03 / BUILT FOR THE FIELD</span><span className="bt-home-plus" aria-hidden="true">✳</span></div><div className="bt-home-workflow-heading"><h2 id="bt-home-workflows-title">From site to<br/><em>the bigger picture.</em></h2><p>Designed for the handoffs that matter. Built around clearer coordination as projects grow in people, places and complexity.</p></div></MarketingReveal>
            <div className="bt-home-story-grid">
              <MarketingReveal className="bt-home-story-main"><article className="bt-home-story bt-home-story-one"><div className="bt-home-story-image" role="img" aria-label="Illustrative exterior of a modern building"/><div className="bt-home-story-caption"><span>01 / PROJECT OVERSIGHT</span><h3>Know where<br/>work stands.</h3><span className="bt-home-story-mark" aria-hidden="true">↗</span></div></article></MarketingReveal>
              <div className="bt-home-story-stack">
                <MarketingReveal><article className="bt-home-story bt-home-story-two"><div className="bt-home-story-image" role="img" aria-label="Illustrative high-rise building architecture"/><div className="bt-home-story-caption"><span>02 / SITE OPERATIONS</span><h3>Keep teams<br/>connected.</h3><span className="bt-home-story-mark" aria-hidden="true">↗</span></div></article></MarketingReveal>
                <MarketingReveal><article className="bt-home-story bt-home-story-three"><div className="bt-home-story-image" role="img" aria-label="Illustrative contemporary house"/><div className="bt-home-story-caption"><span>03 / DELIVERY VISIBILITY</span><h3>Make room for<br/>better decisions.</h3><span className="bt-home-story-mark" aria-hidden="true">↗</span></div></article></MarketingReveal>
              </div>
            </div>
            <p className="bt-home-image-note">All architectural photographs are illustrative. They are not a portfolio of BuildTrack customer projects.</p>
          </div>
        </section>

        <section className="bt-home-manifesto bt-home-section" id="approach" aria-labelledby="bt-home-manifesto-title"><div className="bt-home-wrap"><MarketingReveal><div className="bt-home-overline"><span>04 / OUR APPROACH</span><span className="bt-home-plus" aria-hidden="true">✳</span></div><div className="bt-home-manifesto-grid"><div><h2 id="bt-home-manifesto-title">Good projects need<br/><em>good information.</em></h2><span className="bt-home-manifesto-symbol" aria-hidden="true">✳</span></div><div className="bt-home-manifesto-copy"><p>Less chasing updates.<br/>More understanding what matters.</p><p>BuildTrack is taking a considered, phased approach to construction management—starting with secure foundations and moving toward connected operations across the entire project lifecycle.</p><Link href="/dashboard" className="bt-home-outline-link">Explore the workspace <span aria-hidden="true">↗</span></Link></div></div></MarketingReveal></div></section>

        <section className="bt-home-faq bt-home-section" id="faq" aria-labelledby="bt-home-faq-title"><div className="bt-home-wrap bt-home-faq-grid"><MarketingReveal><div className="bt-home-overline"><span>05 / GOOD TO KNOW</span><span className="bt-home-plus" aria-hidden="true">✳</span></div><h2 id="bt-home-faq-title">A few<br/><em>good questions.</em></h2><p>Clarity starts before the first project.</p></MarketingReveal><div className="bt-home-faq-items">{questions.map((item, index) => <details className="bt-home-faq-item" key={item.question}><summary><span>0{index + 1}</span><strong>{item.question}</strong><span className="bt-home-faq-toggle" aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div></div></section>

        <section className="bt-home-final" id="contact" aria-labelledby="bt-home-final-title"><div className="bt-home-wrap"><div className="bt-home-overline"><span>06 / TAKE THE NEXT STEP</span><span className="bt-home-plus" aria-hidden="true">✳</span></div><MarketingReveal><p className="bt-home-final-kicker">A stronger way to see what is ahead.</p><h2 id="bt-home-final-title">Make every<br/><em>detail count.</em></h2><div className="bt-home-final-bottom"><p>For people who build things that last.<br/>And need the clarity to get there.</p><div className="bt-home-final-ctas"><Link href="/dashboard">Go to workspace <span aria-hidden="true">↗</span></Link><Link href="/login">Sign in <span aria-hidden="true">↗</span></Link></div></div></MarketingReveal></div></section>
      </main>
      <footer className="bt-home-footer"><div className="bt-home-wrap bt-home-footer-inner"><Link href="/" className="bt-home-footer-brand">BUILDTRACK<span>®</span></Link><p>Construction intelligence, considered.</p><div><a href="#top">Back to top ↑</a><Link href="/dashboard">Workspace ↗</Link></div><small>© BuildTrack</small></div></footer>
    </div>
  );
}
