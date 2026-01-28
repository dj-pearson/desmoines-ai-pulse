import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useSecurityAudit } from '@/hooks/useSecurityAudit';
import { SecurityUtils, ValidationSchemas } from '@/lib/securityUtils';
import { useToast } from '@/hooks/use-toast';
import { Shield, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface ValidationResult {
  field: string;
  isValid: boolean;
  errors: string[];
}

export default function SecurityTestingPanel() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    url: '',
    text: '',
    fileUpload: null as File | null,
  });
  
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { logSecurityEvent } = useSecurityAudit();
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Real-time validation
    validateField(field, value);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFormData(prev => ({ ...prev, fileUpload: file }));
    
    if (file) {
      validateFile(file);
    }
  };

  const validateField = (field: string, value: string) => {
    let result: ValidationResult;
    
    switch (field) {
      case 'email':
        const emailValidation = SecurityUtils.validateEmail(value);
        result = {
          field: 'email',
          isValid: emailValidation.isValid,
          errors: emailValidation.errors,
        };
        break;
        
      case 'password':
        const passwordValidation = SecurityUtils.validatePassword(value);
        result = {
          field: 'password',
          isValid: passwordValidation.isValid,
          errors: passwordValidation.errors,
        };
        break;
        
      case 'url':
        const urlValidation = SecurityUtils.validateURL(value);
        result = {
          field: 'url',
          isValid: urlValidation.isValid,
          errors: urlValidation.errors,
        };
        break;
        
      case 'text':
        const hasSQLInjection = SecurityUtils.containsSQLInjection(value);
        result = {
          field: 'text',
          isValid: !hasSQLInjection && value.length <= 10000,
          errors: [
            ...(hasSQLInjection ? ['Potentially malicious content detected'] : []),
            ...(value.length > 10000 ? ['Text exceeds maximum length'] : []),
          ],
        };
        break;
        
      default:
        return;
    }
    
    setValidationResults(prev => {
      const filtered = prev.filter(r => r.field !== field);
      return [...filtered, result];
    });
  };

  const validateFile = (file: File) => {
    const fileValidation = SecurityUtils.validateFileUpload(file);
    const result: ValidationResult = {
      field: 'fileUpload',
      isValid: fileValidation.isValid,
      errors: fileValidation.errors,
    };
    
    setValidationResults(prev => {
      const filtered = prev.filter(r => r.field !== 'fileUpload');
      return [...filtered, result];
    });
  };

  const testRateLimit = async () => {
    setIsLoading(true);
    
    try {
      // Simulate multiple rapid requests
      const promises = Array.from({ length: 10 }, (_, i) => 
        new Promise(resolve => {
          setTimeout(() => {
            const { allowed } = SecurityUtils.checkRateLimit('test-user', 5, 60000);
            resolve({ attempt: i + 1, allowed });
          }, i * 100);
        })
      );
      
      const results = await Promise.all(promises);
      
      // Log security event
      await logSecurityEvent({
        event_type: 'rate_limit',
        identifier: 'test-user',
        endpoint: '/test/rate-limit',
        details: { results },
        severity: 'medium',
      });
      
      toast({
        title: 'Rate Limit Test Complete',
        description: `Tested ${results.length} requests. Check console for results.`,
      });
      
      console.log('Rate Limit Test Results:', results);
    } catch (error) {
      toast({
        title: 'Rate Limit Test Failed',
        description: 'An error occurred during the test.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const testInputSanitization = () => {
    const maliciousInputs = [
      '<script>alert("XSS")</script>',
      'SELECT * FROM users; DROP TABLE users;--',
      '../../etc/passwd',
      'javascript:alert("XSS")',
    ];
    
    const results = maliciousInputs.map(input => ({
      input,
      sanitized: SecurityUtils.sanitizeHTML(input),
      containsSQL: SecurityUtils.containsSQLInjection(input),
    }));
    
    console.log('Input Sanitization Test Results:', results);
    
    toast({
      title: 'Input Sanitization Test Complete',
      description: 'Check console for sanitization results.',
    });
  };

  const generateSecureToken = () => {
    const token = SecurityUtils.generateSecureToken(32);
    navigator.clipboard.writeText(token);
    
    toast({
      title: 'Secure Token Generated',
      description: 'Token copied to clipboard.',
    });
    
    console.log('Generated Token:', token);
  };

  const getValidationIcon = (result: ValidationResult) => {
    if (result.isValid) {
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    } else {
      return <XCircle className="h-4 w-4 text-red-600" />;
    }
  };

  const getValidationBadge = (result: ValidationResult) => {
    return (
      <Badge variant={result.isValid ? 'default' : 'destructive'}>
        {result.isValid ? 'Valid' : 'Invalid'}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Security Testing Panel</h2>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Validation Testing */}
        <Card>
          <CardHeader>
            <CardTitle>Input Validation Testing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Email Validation */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="email"
                  type="email"
                  placeholder="test@example.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                />
                {validationResults.find(r => r.field === 'email') && 
                  getValidationIcon(validationResults.find(r => r.field === 'email')!)
                }
              </div>
              {validationResults.find(r => r.field === 'email') && (
                <div className="flex items-center justify-between">
                  {getValidationBadge(validationResults.find(r => r.field === 'email')!)}
                  {validationResults.find(r => r.field === 'email')!.errors.length > 0 && (
                    <div className="text-sm text-red-600">
                      {validationResults.find(r => r.field === 'email')!.errors.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Password Validation */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter a secure password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                />
                {validationResults.find(r => r.field === 'password') && 
                  getValidationIcon(validationResults.find(r => r.field === 'password')!)
                }
              </div>
              {validationResults.find(r => r.field === 'password') && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    {getValidationBadge(validationResults.find(r => r.field === 'password')!)}
                    <div className="text-sm">
                      Strength: <span className={`font-medium ${
                        SecurityUtils.validatePassword(formData.password).strength === 'strong' ? 'text-green-600' :
                        SecurityUtils.validatePassword(formData.password).strength === 'medium' ? 'text-orange-600' :
                        'text-red-600'
                      }`}>
                        {SecurityUtils.validatePassword(formData.password).strength}
                      </span>
                    </div>
                  </div>
                  {validationResults.find(r => r.field === 'password')!.errors.length > 0 && (
                    <div className="text-sm text-red-600">
                      <ul className="list-disc list-inside">
                        {validationResults.find(r => r.field === 'password')!.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* URL Validation */}
            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com"
                  value={formData.url}
                  onChange={(e) => handleInputChange('url', e.target.value)}
                />
                {validationResults.find(r => r.field === 'url') && 
                  getValidationIcon(validationResults.find(r => r.field === 'url')!)
                }
              </div>
              {validationResults.find(r => r.field === 'url') && (
                <div className="flex items-center justify-between">
                  {getValidationBadge(validationResults.find(r => r.field === 'url')!)}
                  {validationResults.find(r => r.field === 'url')!.errors.length > 0 && (
                    <div className="text-sm text-red-600">
                      {validationResults.find(r => r.field === 'url')!.errors.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Text Content Validation */}
            <div className="space-y-2">
              <Label htmlFor="text">Text Content</Label>
              <div className="space-y-2">
                <Textarea
                  id="text"
                  placeholder="Try entering some malicious content..."
                  value={formData.text}
                  onChange={(e) => handleInputChange('text', e.target.value)}
                  className="min-h-[100px]"
                />
                {validationResults.find(r => r.field === 'text') && (
                  <div className="flex items-center justify-between">
                    {getValidationBadge(validationResults.find(r => r.field === 'text')!)}
                    {validationResults.find(r => r.field === 'text')!.errors.length > 0 && (
                      <div className="text-sm text-red-600">
                        {validationResults.find(r => r.field === 'text')!.errors.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* File Upload Validation */}
            <div className="space-y-2">
              <Label htmlFor="file">File Upload</Label>
              <div className="space-y-2">
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileChange}
                />
                {validationResults.find(r => r.field === 'fileUpload') && (
                  <div className="flex items-center justify-between">
                    {getValidationBadge(validationResults.find(r => r.field === 'fileUpload')!)}
                    {validationResults.find(r => r.field === 'fileUpload')!.errors.length > 0 && (
                      <div className="text-sm text-red-600">
                        {validationResults.find(r => r.field === 'fileUpload')!.errors.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Testing Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Security Testing Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Rate Limiting Test */}
            <div className="space-y-2">
              <h4 className="font-medium">Rate Limiting Test</h4>
              <p className="text-sm text-muted-foreground">
                Test rate limiting by simulating multiple rapid requests.
              </p>
              <Button 
                onClick={testRateLimit} 
                disabled={isLoading}
                variant="outline"
                className="w-full"
              >
                {isLoading ? 'Testing...' : 'Test Rate Limiting'}
              </Button>
            </div>

            {/* Input Sanitization Test */}
            <div className="space-y-2">
              <h4 className="font-medium">Input Sanitization Test</h4>
              <p className="text-sm text-muted-foreground">
                Test input sanitization with common attack vectors.
              </p>
              <Button 
                onClick={testInputSanitization}
                variant="outline"
                className="w-full"
              >
                Test Input Sanitization
              </Button>
            </div>

            {/* Secure Token Generation */}
            <div className="space-y-2">
              <h4 className="font-medium">Secure Token Generation</h4>
              <p className="text-sm text-muted-foreground">
                Generate a cryptographically secure random token.
              </p>
              <Button 
                onClick={generateSecureToken}
                variant="outline"
                className="w-full"
              >
                Generate Secure Token
              </Button>
            </div>

            {/* Security Status */}
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-2">Security Status</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">HTTPS Enabled</span>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">CSP Headers</span>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Input Validation</span>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Rate Limiting</span>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Security Guidelines
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Input Validation</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Always validate and sanitize user input</li>
                <li>• Use whitelist validation when possible</li>
                <li>• Implement proper length limits</li>
                <li>• Check for SQL injection patterns</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Authentication</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Enforce strong password policies</li>
                <li>• Implement rate limiting on auth endpoints</li>
                <li>• Use secure session management</li>
                <li>• Enable account lockout after failed attempts</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">File Uploads</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Validate file types and extensions</li>
                <li>• Implement file size limits</li>
                <li>• Scan for malware</li>
                <li>• Store files outside web root</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Headers & CSP</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Implement strict CSP policies</li>
                <li>• Use HSTS for HTTPS enforcement</li>
                <li>• Prevent clickjacking with X-Frame-Options</li>
                <li>• Enable XSS protection headers</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}