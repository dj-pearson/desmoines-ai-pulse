import { useState } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type InquiryType =
  | 'general'
  | 'support'
  | 'feedback'
  | 'business'
  | 'advertising'
  | 'partnership'
  | 'other';

export interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  inquiry_type: InquiryType;
}

export interface ContactSubmission extends ContactFormData {
  id: string;
  status: string;
  priority: string;
  user_id?: string;
  source_page?: string;
  created_at: string;
  updated_at: string;
}

export function useContactForm() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);

  // Submit contact form
  const submitContactForm = async (
    formData: ContactFormData,
    options?: {
      sourcePage?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
    }
  ): Promise<boolean> => {
    try {
      setLoading(true);

      // Prepare submission data
      const submissionData: Record<string, unknown> = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        subject: formData.subject || null,
        message: formData.message,
        inquiry_type: formData.inquiry_type || 'general',
        source_page: options?.sourcePage || (typeof window !== 'undefined' ? window.location.pathname : null),
        utm_source: options?.utmSource || null,
        utm_medium: options?.utmMedium || null,
        utm_campaign: options?.utmCampaign || null,
        referrer: typeof document !== 'undefined' ? document.referrer || null : null,
        user_id: user?.id || null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      };

      const { error } = await supabase
        .from('contact_submissions')
        .insert(submissionData as any);

      if (error) throw error;

      toast.success("Thank you! Your message has been sent successfully. We'll get back to you soon.");
      return true;
    } catch (error) {
      console.error('Failed to submit contact form:', error);
      toast.error('Failed to send message. Please try again or email us directly.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Fetch user's own submissions (for logged-in users)
  const fetchMySubmissions = async (): Promise<ContactSubmission[]> => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('contact_submissions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubmissions(data || []);
      return data || [];
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
      return [];
    }
  };

  // Admin: Fetch all submissions
  const fetchAllSubmissions = async (filters?: {
    status?: string;
    inquiryType?: string;
    limit?: number;
    offset?: number;
  }): Promise<ContactSubmission[]> => {
    try {
      let query = supabase
        .from('contact_submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.inquiryType) {
        query = query.eq('inquiry_type', filters.inquiryType);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(filters.offset, (filters.offset + (filters.limit || 50)) - 1);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSubmissions(data || []);
      return data || [];
    } catch (error) {
      console.error('Failed to fetch all submissions:', error);
      return [];
    }
  };

  // Admin: Update submission status
  const updateSubmissionStatus = async (
    submissionId: string,
    status: string,
    adminNotes?: string
  ): Promise<boolean> => {
    try {
      setLoading(true);

      const updateData: Record<string, unknown> = { status };
      if (adminNotes) {
        updateData.admin_notes = adminNotes;
      }
      if (status === 'responded') {
        updateData.responded_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('contact_submissions')
        .update(updateData as any)
        .eq('id', submissionId);

      if (error) throw error;

      toast.success('Submission status updated');
      return true;
    } catch (error) {
      console.error('Failed to update submission:', error);
      toast.error('Failed to update submission');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Admin: Assign submission to admin
  const assignSubmission = async (
    submissionId: string,
    assignedTo: string
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('contact_submissions')
        .update({ assigned_to: assignedTo } as any)
        .eq('id', submissionId);

      if (error) throw error;

      toast.success('Submission assigned');
      return true;
    } catch (error) {
      console.error('Failed to assign submission:', error);
      toast.error('Failed to assign submission');
      return false;
    }
  };

  return {
    // State
    loading,
    submissions,

    // Actions
    submitContactForm,
    fetchMySubmissions,
    fetchAllSubmissions,
    updateSubmissionStatus,
    assignSubmission,
  };
}
