import type { TutorialMetadata } from './tutorial-definition';

interface LocalizedAgentStep {
  readonly title: string;
  readonly content: string;
  readonly targetAccessibleName?: string;
}

interface LocalizedAgentTutorial {
  readonly metadata: Pick<TutorialMetadata, 'title' | 'summary' | 'category' | 'learningOutcomes'>;
  readonly steps: Readonly<Record<string, LocalizedAgentStep>>;
  readonly completionTitle: string;
  readonly completionOutcomes: readonly string[];
}

const VIETNAMESE_AGENT_TUTORIALS: Readonly<Record<string, LocalizedAgentTutorial>> = {
  'tutorial-agent-ask-data': {
    metadata: {
      title: 'Hỏi dữ liệu đã kết nối',
      summary:
        'Gắn cơ sở dữ liệu PostgreSQL giả lập, đặt câu hỏi bằng ngôn ngữ thường và xem SQL cùng tóm tắt hoạt động.',
      category: 'Kiến thức Agent thiết yếu',
      learningOutcomes: [
        'Giới hạn cuộc trò chuyện trong một cơ sở dữ liệu',
        'Đặt câu hỏi dữ liệu bằng ngôn ngữ tự nhiên',
        'Kiểm tra SQL và tóm tắt hoạt động của agent',
      ],
    },
    steps: {
      'ask-data-select-database': {
        title: 'Gắn cơ sở dữ liệu hướng dẫn',
        content:
          'Sandbox này dùng dữ liệu bán lẻ giả lập. Chọn Retail demo để giới hạn cuộc trò chuyện trong các bảng PostgreSQL.',
        targetAccessibleName: 'Bộ chọn cơ sở dữ liệu',
      },
      'ask-data-send-question': {
        title: 'Hỏi bằng ngôn ngữ thường',
        content:
          'Câu hỏi đã được điền sẵn. Nhấn Gửi để nhận cùng một kết quả chỉ đọc an toàn mỗi lần.',
        targetAccessibleName: 'Trình soạn tin nhắn',
      },
      'ask-data-open-reasoning': {
        title: 'Xem tóm tắt hoạt động',
        content:
          'Mở Xem lập luận để xem các bước kiểm tra schema, tạo SQL, thực thi và tóm tắt. Đây không phải chuỗi suy luận riêng tư.',
        targetAccessibleName: 'Xem lập luận',
      },
      'ask-data-open-result': {
        title: 'Kiểm tra kết quả truy vấn',
        content: 'Mở bảng kết quả và đối chiếu các hàng trả về với SQL đã tạo.',
        targetAccessibleName: 'Bảng doanh thu hàng tháng',
      },
      'ask-data-review': {
        title: 'Xem lại câu trả lời',
        content:
          'Câu trả lời, SQL và các hàng đều là dữ liệu hướng dẫn cố định. Hoàn tất khi bạn đã hiểu quy trình.',
      },
    },
    completionTitle: 'Đã hoàn tất hỏi dữ liệu đã kết nối',
    completionOutcomes: ['Gắn dữ liệu, đặt câu hỏi và kiểm tra kết quả cố định'],
  },
  'tutorial-agent-create-artifacts': {
    metadata: {
      title: 'Tạo artifact từ dữ liệu',
      summary: 'Chuyển kết quả truy vấn cố định thành bảng, biểu đồ và báo cáo Markdown.',
      category: 'Kiến thức Agent thiết yếu',
      learningOutcomes: ['Tạo bảng từ SQL', 'Tạo biểu đồ từ SQL', 'Tạo và xem trước tệp báo cáo'],
    },
    steps: {
      'artifacts-send-table': {
        title: 'Yêu cầu bảng',
        content: 'Yêu cầu doanh số theo khu vực đã được điền sẵn. Nhấn Gửi.',
        targetAccessibleName: 'Trình soạn tin nhắn',
      },
      'artifacts-open-table': {
        title: 'Mở artifact bảng',
        content: 'Mở thẻ bảng để xem các hàng và chi tiết nguồn.',
        targetAccessibleName: 'Bảng doanh số theo khu vực',
      },
      'artifacts-send-chart': {
        title: 'Yêu cầu biểu đồ',
        content: 'Yêu cầu biểu đồ doanh thu hàng tháng đã được điền sẵn. Nhấn Gửi.',
        targetAccessibleName: 'Trình soạn tin nhắn',
      },
      'artifacts-open-chart': {
        title: 'Mở artifact biểu đồ',
        content: 'Mở thẻ biểu đồ. Tính năng lưu vào thư viện thật bị tắt trong sandbox.',
        targetAccessibleName: 'Biểu đồ doanh thu hàng tháng',
      },
      'artifacts-send-report': {
        title: 'Yêu cầu báo cáo',
        content:
          'Yêu cầu báo cáo hàng quý đã được điền sẵn. Nhấn Gửi; trình mô phỏng không ghi vào workspace thật.',
        targetAccessibleName: 'Trình soạn tin nhắn',
      },
      'artifacts-open-report': {
        title: 'Xem trước tệp báo cáo',
        content: 'Mở reports/q3-sales.md trong trình xem hướng dẫn.',
        targetAccessibleName: 'Báo cáo doanh số hàng quý',
      },
      'artifacts-review': {
        title: 'Xem lại các artifact',
        content: 'Bạn đã tạo bảng, biểu đồ và báo cáo từ cùng một cơ sở dữ liệu giả lập.',
      },
    },
    completionTitle: 'Đã hoàn tất tạo artifact từ dữ liệu',
    completionOutcomes: ['Tạo và xem bảng, biểu đồ cùng báo cáo Markdown'],
  },
  'tutorial-agent-clarify-approve': {
    metadata: {
      title: 'Làm rõ và phê duyệt hành động',
      summary:
        'Trả lời câu hỏi làm rõ và phê duyệt thao tác ghi báo cáo cố định trước khi thực thi.',
      category: 'Kiến thức Agent thiết yếu',
      learningOutcomes: [
        'Nhận biết khi agent cần làm rõ',
        'Kiểm tra bản xem trước hành động',
        'Phê duyệt hoặc từ chối thực thi',
      ],
    },
    steps: {
      'control-send-request': {
        title: 'Gửi yêu cầu mơ hồ',
        content:
          'Yêu cầu Lưu báo cáo bán hàng đã được điền sẵn. Nhấn Gửi; vị trí lưu được cố ý bỏ trống.',
        targetAccessibleName: 'Trình soạn tin nhắn',
      },
      'control-answer-question': {
        title: 'Làm rõ vị trí',
        content: 'Chọn Workspace / reports để agent biết nơi lưu tệp.',
        targetAccessibleName: 'Workspace / reports',
      },
      'control-approve': {
        title: 'Phê duyệt thao tác ghi',
        content:
          'Kiểm tra bản xem trước an toàn rồi phê duyệt. Từ chối sẽ không ghi gì; bạn có thể thử lại.',
        targetAccessibleName: 'Phê duyệt',
      },
      'control-open-report': {
        title: 'Xác minh kết quả',
        content: 'Mở báo cáo đã tạo để xác nhận hành động được phê duyệt.',
        targetAccessibleName: 'Báo cáo bán hàng đã phê duyệt',
      },
      'control-review': {
        title: 'Duy trì quyền kiểm soát',
        content: 'Làm rõ giải quyết sự mơ hồ; phê duyệt ngăn thực thi trước khi bạn đồng ý.',
      },
    },
    completionTitle: 'Đã hoàn tất làm rõ và phê duyệt',
    completionOutcomes: ['Làm rõ đích đến và chỉ cho phép ghi sau khi phê duyệt'],
  },
  'tutorial-agent-files-conversations': {
    metadata: {
      title: 'Làm việc với tệp và cuộc trò chuyện',
      summary: 'Phân tích mẫu CSV hoặc Excel cục bộ và chuyển giữa các luồng hội thoại cô lập.',
      category: 'Kiến thức Agent thiết yếu',
      learningOutcomes: [
        'Gắn và xem trước CSV hoặc Excel cục bộ',
        'Hỏi về dữ liệu trong tệp',
        'Tạo và mở lại các cuộc trò chuyện riêng',
      ],
    },
    steps: {
      'files-attach': {
        title: 'Gắn tệp mẫu',
        content:
          'Tải một tệp mẫu rồi gắn tệp. Tệp chỉ được đọc trong trình duyệt và không bao giờ được tải lên.',
        targetAccessibleName: 'Gắn tệp',
      },
      'files-ask': {
        title: 'Hỏi về tệp',
        content:
          'Câu hỏi về doanh thu sản phẩm đã được điền sẵn. Nhấn Gửi; hai mẫu cho cùng kết quả.',
        targetAccessibleName: 'Trình soạn tin nhắn',
      },
      'files-new-thread': {
        title: 'Bắt đầu cuộc trò chuyện khác',
        content:
          'Tạo cuộc trò chuyện hướng dẫn mới. Luồng đầu tiên chỉ tồn tại khi walkthrough đang mở.',
        targetAccessibleName: 'Cuộc trò chuyện mới',
      },
      'files-second-question': {
        title: 'Hỏi một câu khác',
        content: 'Câu hỏi thứ hai đã được điền sẵn trong luồng mới. Nhấn Gửi.',
        targetAccessibleName: 'Trình soạn tin nhắn',
      },
      'files-open-history': {
        title: 'Mở lịch sử trò chuyện',
        content: 'Mở menu cuộc trò chuyện để xem cả hai luồng hướng dẫn.',
        targetAccessibleName: 'Lịch sử trò chuyện',
      },
      'files-switch-thread': {
        title: 'Quay lại luồng đầu tiên',
        content: 'Chọn Phân tích tệp và xác nhận bản ghi vẫn còn.',
        targetAccessibleName: 'Cuộc trò chuyện phân tích tệp',
      },
      'files-review': {
        title: 'Xem lại quy trình',
        content: 'Bạn đã phân tích tệp cục bộ và chuyển giữa hai luồng cô lập.',
      },
    },
    completionTitle: 'Đã hoàn tất làm việc với tệp và cuộc trò chuyện',
    completionOutcomes: ['Phân tích tệp mẫu và chuyển giữa hai luồng hội thoại'],
  },
};

export function getVietnameseAgentTutorial(tutorialId: string): LocalizedAgentTutorial | null {
  return VIETNAMESE_AGENT_TUTORIALS[tutorialId] ?? null;
}
