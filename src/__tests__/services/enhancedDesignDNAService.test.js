import enhancedDesignDNAService from '../../services/enhancedDesignDNAService.js';
import togetherAIReasoningService from '../../services/togetherAIReasoningService.js';

// Mock dependencies
jest.mock('../../services/togetherAIReasoningService');
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

describe('EnhancedDesignDNAService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generateMasterDesignDNA', () => {
        it('should generate DNA successfully', async () => {
            const mockDNA = {
                dimensions: { length: 10, width: 10, height: 3, floors: 1 },
                materials: [{ name: 'Brick', hexColor: '#B22222' }],
                roof: { type: 'Gable' }
            };

            togetherAIReasoningService.chatCompletion.mockResolvedValue({
                choices: [{ message: { content: JSON.stringify(mockDNA) } }]
            });

            const result = await enhancedDesignDNAService.generateMasterDesignDNA({
                floorArea: 100,
                architecturalStyle: 'Modern'
            });

            expect(result.success).toBe(true);
            expect(result.masterDNA.dimensions.length).toBe(10);
            expect(result.masterDNA.is_authoritative).toBe(true);
        });

        it('should handle errors and return fallback', async () => {
            togetherAIReasoningService.chatCompletion.mockRejectedValue(new Error('API Error'));

            const result = await enhancedDesignDNAService.generateMasterDesignDNA({
                floorArea: 100
            });

            expect(result.success).toBe(false);
            expect(result.masterDNA).toBeDefined(); // Should return fallback
            expect(result.error).toBeDefined();
        });
    });

    describe('extractDNAFromPortfolio', () => {
        it('should extract DNA from image URL', async () => {
            const mockAnalysis = { style: 'Minimalist', materials: ['Concrete'] };
            togetherAIReasoningService.chatCompletion.mockResolvedValue({
                choices: [{ message: { content: JSON.stringify(mockAnalysis) } }]
            });

            const portfolioFiles = [{ url: 'http://example.com/image.jpg' }];
            const result = await enhancedDesignDNAService.extractDNAFromPortfolio(portfolioFiles);

            expect(result).toEqual(mockAnalysis);
            expect(togetherAIReasoningService.chatCompletion).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'user',
                        content: expect.arrayContaining([
                            expect.objectContaining({
                                type: 'image_url',
                                image_url: expect.objectContaining({ url: 'http://example.com/image.jpg' })
                            })
                        ])
                    })
                ]),
                expect.any(Object)
            );
        });

        it('should extract DNA from pngDataUrl (PDF conversion)', async () => {
            const mockAnalysis = { style: 'Modern' };
            togetherAIReasoningService.chatCompletion.mockResolvedValue({
                choices: [{ message: { content: JSON.stringify(mockAnalysis) } }]
            });

            const portfolioFiles = [{ pngDataUrl: 'data:image/png;base64,xyz' }];
            const result = await enhancedDesignDNAService.extractDNAFromPortfolio(portfolioFiles);

            expect(result).toEqual(mockAnalysis);
            expect(togetherAIReasoningService.chatCompletion).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'user',
                        content: expect.arrayContaining([
                            expect.objectContaining({
                                type: 'image_url',
                                image_url: expect.objectContaining({ url: 'data:image/png;base64,xyz' })
                            })
                        ])
                    })
                ]),
                expect.any(Object)
            );
        });
    });
});
