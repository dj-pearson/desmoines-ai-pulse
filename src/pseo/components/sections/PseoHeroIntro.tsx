interface PseoHeroIntroProps {
  content: string;
}

export function PseoHeroIntro({ content }: PseoHeroIntroProps) {
  return (
    <section className="prose prose-lg max-w-none">
      <p className="text-lg text-muted-foreground leading-relaxed">
        {content}
      </p>
    </section>
  );
}
