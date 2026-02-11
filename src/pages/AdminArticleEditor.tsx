import EnhancedArticleEditor from "@/components/cms/EnhancedArticleEditor";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import '@/components/cms/tiptap-styles.css';

export default function AdminArticleEditor() {
  useDocumentTitle("Article Editor");
  return <EnhancedArticleEditor />;
}
