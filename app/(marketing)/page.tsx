import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import {
  BuiltOn,
  Faq,
  FinalCta,
  Footer,
  Integrations,
  LoopDemos,
  PilotData,
  Stages,
  ValueProps,
} from "@/components/landing/sections";

export default function LandingPage() {
  return (
    <>
      <LandingHeader />
      <main>
        <Hero />
        <BuiltOn />
        <ValueProps />
        <LoopDemos />
        <Stages />
        <Integrations />
        <PilotData />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
