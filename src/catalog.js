import curriculumText from '../docs/curriculum.md?raw';

const generatedLessons = import.meta.glob('../content/lessons/*.json', {
  eager: true,
  import: 'default',
});

export const lessons = Object.values(generatedLessons).sort((a, b) => a.id.localeCompare(b.id));
export const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

const headings = [...curriculumText.matchAll(/^###\s+([A-Z]\d-\d{2})\s+—\s+(.+)$/gm)];
export const topics = headings.map((match, index) => {
  const start = match.index + match[0].length;
  const end = headings[index + 1]?.index ?? curriculumText.length;
  const excerpt = curriculumText.slice(start, end);
  const level = match[1].split('-')[0];
  return {
    id: match[1],
    title: match[2].trim(),
    level,
    lessons: lessons.filter((lesson) => lesson.curriculum_topics?.includes(match[1])),
    prerequisites: excerpt.match(/- Уровень: [^.]+\. Предпосылки: ([^.]+)\./)?.[1] ?? 'не указаны',
  };
});

export const levels = ['A0', 'A1', 'A2', 'B1', 'B2'].map((id) => ({
  id,
  topics: topics.filter((topic) => topic.level === id),
}));

export function tasksFor(lesson) {
  return lesson?.tasks ?? [];
}
