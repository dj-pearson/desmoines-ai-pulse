import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useContactForm, InquiryType } from "@/hooks/useContactForm";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import {
  Mail,
  Phone,
  MapPin,
  Send,
  MessageSquare,
  Building2,
  Megaphone,
  HelpCircle,
  ThumbsUp,
  Clock,
  CheckCircle
} from "lucide-react";

const inquiryTypes: { value: InquiryType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'general',
    label: 'General Inquiry',
    icon: <MessageSquare className="w-5 h-5" />,
    description: 'Questions about our platform or services'
  },
  {
    value: 'support',
    label: 'Support',
    icon: <HelpCircle className="w-5 h-5" />,
    description: 'Technical issues or account help'
  },
  {
    value: 'feedback',
    label: 'Feedback',
    icon: <ThumbsUp className="w-5 h-5" />,
    description: 'Share your thoughts and suggestions'
  },
  {
    value: 'business',
    label: 'Business Inquiry',
    icon: <Building2 className="w-5 h-5" />,
    description: 'Partnership or collaboration opportunities'
  },
  {
    value: 'advertising',
    label: 'Advertising',
    icon: <Megaphone className="w-5 h-5" />,
    description: 'Promote your business with us'
  },
];

export default function Contact() {
  const { user } = useAuth();
  const { submitContactForm, loading } = useContactForm();
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    name: user?.user_metadata?.full_name || '',
    email: user?.email || '',
    phone: '',
    subject: '',
    message: '',
    inquiry_type: 'general' as InquiryType
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await submitContactForm(formData, {
      sourcePage: '/contact'
    });

    if (success) {
      setSubmitted(true);
      setFormData({
        name: user?.user_metadata?.full_name || '',
        email: user?.email || '',
        phone: '',
        subject: '',
        message: '',
        inquiry_type: 'general'
      });
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <SEOHead
        title="Contact Us - Des Moines Insider"
        description="Get in touch with Des Moines Insider. We're here to help with questions about events, restaurants, business partnerships, advertising, and more."
        keywords={["contact Des Moines Insider", "get in touch", "support", "business partnership", "advertising"]}
      />

      <div className="min-h-screen bg-background">
        <Header />

        <main className="container mx-auto px-4 py-8">
          <div className="max-w-6xl mx-auto">
            {/* Hero Section */}
            <div className="text-center space-y-4 mb-12">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold">
                Get in <span className="text-primary">Touch</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Have a question, suggestion, or want to partner with us?
                We'd love to hear from you!
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Contact Information */}
              <div className="lg:col-span-1 space-y-6">
                {/* Quick Contact Cards */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Contact Information</CardTitle>
                    <CardDescription>Reach out to us directly</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Mail className="w-5 h-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium">Email</p>
                        <a
                          href="mailto:hello@desmoinesinsider.com"
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          hello@desmoinesinsider.com
                        </a>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium">Location</p>
                        <p className="text-muted-foreground">Des Moines, Iowa</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium">Response Time</p>
                        <p className="text-muted-foreground">Within 24-48 hours</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Inquiry Type Cards */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">How Can We Help?</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {inquiryTypes.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => handleChange('inquiry_type', type.value)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          formData.inquiry_type === type.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={formData.inquiry_type === type.value ? 'text-primary' : 'text-muted-foreground'}>
                            {type.icon}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{type.label}</p>
                            <p className="text-xs text-muted-foreground">{type.description}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>

                {/* Quick Links */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Quick Links</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <a
                      href="/business-partnership"
                      className="block p-2 rounded hover:bg-muted transition-colors text-sm"
                    >
                      <Building2 className="w-4 h-4 inline mr-2" />
                      Business Partnership
                    </a>
                    <a
                      href="/advertise"
                      className="block p-2 rounded hover:bg-muted transition-colors text-sm"
                    >
                      <Megaphone className="w-4 h-4 inline mr-2" />
                      Advertise With Us
                    </a>
                    <a
                      href="/pricing"
                      className="block p-2 rounded hover:bg-muted transition-colors text-sm"
                    >
                      <CheckCircle className="w-4 h-4 inline mr-2" />
                      Subscription Plans
                    </a>
                  </CardContent>
                </Card>
              </div>

              {/* Contact Form */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" />
                      Send Us a Message
                    </CardTitle>
                    <CardDescription>
                      Fill out the form below and we'll get back to you as soon as possible.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {submitted ? (
                      <div className="text-center py-12 space-y-4">
                        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                          <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                        </div>
                        <h3 className="text-2xl font-bold">Message Sent!</h3>
                        <p className="text-muted-foreground max-w-md mx-auto">
                          Thank you for reaching out. We've received your message and will get back to you within 24-48 hours.
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => setSubmitted(false)}
                          className="mt-4"
                        >
                          Send Another Message
                        </Button>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label htmlFor="name" className="text-sm font-medium">
                              Name <span className="text-destructive">*</span>
                            </label>
                            <Input
                              id="name"
                              placeholder="Your name"
                              value={formData.name}
                              onChange={(e) => handleChange('name', e.target.value)}
                              required
                            />
                          </div>

                          <div className="space-y-2">
                            <label htmlFor="email" className="text-sm font-medium">
                              Email <span className="text-destructive">*</span>
                            </label>
                            <Input
                              id="email"
                              type="email"
                              placeholder="your@email.com"
                              value={formData.email}
                              onChange={(e) => handleChange('email', e.target.value)}
                              required
                            />
                          </div>

                          <div className="space-y-2">
                            <label htmlFor="phone" className="text-sm font-medium">
                              Phone <span className="text-muted-foreground">(optional)</span>
                            </label>
                            <Input
                              id="phone"
                              type="tel"
                              placeholder="(515) 555-0123"
                              value={formData.phone}
                              onChange={(e) => handleChange('phone', e.target.value)}
                            />
                          </div>

                          <div className="space-y-2">
                            <label htmlFor="inquiry_type" className="text-sm font-medium">
                              Inquiry Type
                            </label>
                            <Select
                              value={formData.inquiry_type}
                              onValueChange={(value) => handleChange('inquiry_type', value)}
                            >
                              <SelectTrigger id="inquiry_type" aria-label="Select inquiry type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {inquiryTypes.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                  </SelectItem>
                                ))}
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="subject" className="text-sm font-medium">
                            Subject <span className="text-muted-foreground">(optional)</span>
                          </label>
                          <Input
                            id="subject"
                            placeholder="What's this about?"
                            value={formData.subject}
                            onChange={(e) => handleChange('subject', e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="message" className="text-sm font-medium">
                            Message <span className="text-destructive">*</span>
                          </label>
                          <Textarea
                            id="message"
                            placeholder="Tell us what's on your mind..."
                            value={formData.message}
                            onChange={(e) => handleChange('message', e.target.value)}
                            rows={6}
                            required
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">
                            <span className="text-destructive">*</span> Required fields
                          </p>
                          <Button type="submit" disabled={loading} size="lg">
                            {loading ? (
                              <>Sending...</>
                            ) : (
                              <>
                                <Send className="w-4 h-4 mr-2" />
                                Send Message
                              </>
                            )}
                          </Button>
                        </div>
                      </form>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
